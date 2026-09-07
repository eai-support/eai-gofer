import { constants, existsSync } from 'fs';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ProjectDetector, type ProjectInfo } from './ProjectDetector';

export type OptionalToolId =
  | 'stryker'
  | 'playwright'
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'antigravity'
  | 'grok'
  | 'gh'
  | 'az';

export interface OptionalToolRecommendation {
  id: OptionalToolId;
  label: string;
  category: 'repo' | 'global';
  installed: boolean;
  recommended: boolean;
  detail: string;
  reason: string;
}

interface PackageJsonManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ToolPickItem extends vscode.QuickPickItem {
  toolId: OptionalToolId;
}

interface PackagedInstaller {
  executable: string;
  scriptPath: string;
  cleanupRoot: string;
  argumentPrefix: string[];
  platform: 'posix' | 'windows';
}

type CommandAvailabilityProbe = (
  command: string,
  args: readonly string[],
  options: { timeout: number },
  callback: (error: NodeJS.ErrnoException | null) => void
) => unknown;

const EXTENSION_ID = 'EnterpriseAI.gofer';
// These digests are the execution trust boundary. Update them only after reviewing the
// corresponding extension resource; workspace copies are deliberately never executed.
const PACKAGED_INSTALLERS: Readonly<
  Record<'posix' | 'windows', { relativePath: readonly string[]; sha256: string }>
> = {
  posix: {
    relativePath: ['resources', 'bash-scripts', 'install-optional-tools.sh'],
    sha256: 'f24b8840d838b85fa5a1ed1e2670b54a185340cb20f0ad41396a705987f025a9',
  },
  windows: {
    relativePath: ['resources', 'powershell-scripts', 'install-optional-tools.ps1'],
    sha256: '530c21f8beafcebce88e903a734a4ee7cab8c263a31e2a98a8d5084b8d1abb3f',
  },
};

export async function probeCommandAvailability(
  command: string,
  args: string[],
  execute: CommandAvailabilityProbe = execFile as unknown as CommandAvailabilityProbe
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execute(command, args, { timeout: 5000 }, (error) => resolve(error === null));
  });
}

@injectable()
export class OptionalToolInstaller {
  constructor(private readonly logger: Logger) {}

  public async promptForRecommendedTools(workspacePath: string): Promise<void> {
    this.assertWorkspaceTrusted();
    const recommendations = await this.getRecommendations(workspacePath);
    const missingRecommendedTools = recommendations.filter(
      (tool): boolean => !tool.installed && tool.recommended
    );

    if (missingRecommendedTools.length === 0) {
      return;
    }

    const toolLabels = missingRecommendedTools.map((tool): string => tool.label).join(', ');
    const choice = await vscode.window.showInformationMessage(
      `Gofer is ready. Install recommended optional developer tools?\n\n${toolLabels}`,
      'Install Recommended',
      'Choose Tools',
      'Skip'
    );

    if (choice === 'Install Recommended') {
      await this.runInstaller(
        workspacePath,
        missingRecommendedTools.map((tool): OptionalToolId => tool.id)
      );
      return;
    }

    if (choice === 'Choose Tools') {
      await this.promptForToolSelection(workspacePath);
    }
  }

  public async promptForToolSelection(workspacePath: string): Promise<void> {
    this.assertWorkspaceTrusted();
    const recommendations = await this.getRecommendations(workspacePath);
    const missingTools = recommendations.filter((tool): boolean => !tool.installed);

    if (missingTools.length === 0) {
      vscode.window.showInformationMessage(
        'All supported optional developer tools are already installed.'
      );
      return;
    }

    const picks: ToolPickItem[] = missingTools.map(
      (tool): ToolPickItem => ({
        toolId: tool.id,
        label: tool.label,
        description: tool.category === 'repo' ? 'Repository tool' : 'Global CLI',
        detail: `${tool.detail} ${tool.reason}`.trim(),
        picked: tool.recommended,
      })
    );

    const selection = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      title: 'Install Optional Developer Tools',
      placeHolder: 'Select the repo packages and global CLIs Gofer should install',
      ignoreFocusOut: true,
    });

    if (!selection || selection.length === 0) {
      return;
    }

    await this.runInstaller(
      workspacePath,
      selection.map((item): OptionalToolId => item.toolId)
    );
  }

  public async runInstaller(workspacePath: string, toolIds: OptionalToolId[]): Promise<void> {
    if (toolIds.length === 0) {
      return;
    }

    this.assertWorkspaceTrusted();
    const installer = await this.resolvePackagedInstaller();

    const toolsCsv = toolIds.join(',');
    this.logger.info('OptionalToolInstaller', 'Launching optional tools installer', {
      toolIds,
      platform: installer.platform,
    });

    const execution = new vscode.ProcessExecution(
      installer.executable,
      [
        ...installer.argumentPrefix,
        installer.scriptPath,
        ...(installer.platform === 'windows'
          ? ['-WorkspacePath', workspacePath, '-Tools', toolsCsv]
          : ['--workspace-path', workspacePath, '--tools', toolsCsv]),
      ],
      { cwd: workspacePath }
    );
    const task = new vscode.Task(
      { type: 'gofer-optional-tools', tools: toolsCsv },
      vscode.TaskScope.Workspace,
      'Install Optional Developer Tools',
      'Gofer',
      execution
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: false,
    };

    let taskExecution: vscode.TaskExecution | undefined;
    const cleanupSubscription = vscode.tasks.onDidEndTaskProcess((event): void => {
      if (taskExecution && event.execution === taskExecution) {
        cleanupSubscription.dispose();
        void fs.rm(installer.cleanupRoot, { recursive: true, force: true });
      }
    });
    try {
      taskExecution = await vscode.tasks.executeTask(task);
    } catch (error) {
      cleanupSubscription.dispose();
      await fs.rm(installer.cleanupRoot, { recursive: true, force: true });
      throw error;
    }

    const installedLabels = toolIds.join(', ');
    vscode.window.showInformationMessage(
      `Started optional tools installation in terminal: ${installedLabels}`
    );
  }

  public async getRecommendations(workspacePath: string): Promise<OptionalToolRecommendation[]> {
    const [projectInfo, manifest] = await Promise.all([
      ProjectDetector.detect(workspacePath),
      this.readPackageManifest(workspacePath),
    ]);

    const availability = await Promise.all([
      this.isCommandAvailable('claude', ['--version']),
      this.isCommandAvailable('codex', ['--version']),
      this.isCommandAvailable('copilot', ['--version']),
      this.isCommandAvailable('agy', ['--version']),
      this.isCommandAvailable('grok', ['--version']),
      this.isCommandAvailable('gh', ['--version']),
      this.isCommandAvailable('az', ['version']),
    ]);

    const recommendations: OptionalToolRecommendation[] = [];
    const packageManager = this.getPackageManager(projectInfo, workspacePath);
    const supportsRepoTools = Boolean(packageManager) && manifest !== null;

    if (supportsRepoTools) {
      recommendations.push({
        id: 'stryker',
        label: 'Stryker mutation testing',
        category: 'repo',
        installed: this.hasDependency(manifest, '@stryker-mutator/core'),
        recommended: true,
        detail: 'Adds @stryker-mutator/core to this repository.',
        reason: 'Improves `/6_gofer_validate` test-authenticity checks.',
      });

      recommendations.push({
        id: 'playwright',
        label: 'Playwright test runner',
        category: 'repo',
        installed: this.hasDependency(manifest, '@playwright/test'),
        recommended: this.isPlaywrightRecommended(projectInfo),
        detail: 'Adds @playwright/test and installs Playwright browsers.',
        reason: this.isPlaywrightRecommended(projectInfo)
          ? 'Recommended for UI and end-to-end testing in this project.'
          : 'Useful when you want Gofer-managed end-to-end tests.',
      });
    }

    recommendations.push(
      {
        id: 'claude',
        label: 'Claude Code CLI',
        category: 'global',
        installed: availability[0],
        recommended: true,
        detail: 'Installs or updates Claude Code with Anthropic’s recommended native installer.',
        reason: 'Enables Claude-based Gofer workflows from the terminal.',
      },
      {
        id: 'codex',
        label: 'OpenAI Codex CLI',
        category: 'global',
        installed: availability[1],
        recommended: true,
        detail: 'Installs or updates Codex CLI with OpenAI’s recommended standalone installer.',
        reason: 'Enables Codex-based Gofer workflows from the terminal.',
      },
      {
        id: 'copilot',
        label: 'GitHub Copilot CLI',
        category: 'global',
        installed: availability[2],
        recommended: true,
        detail: 'Installs or updates the current @github/copilot CLI package.',
        reason:
          'Enables GitHub Copilot Gofer workflows from the terminal and supported app handoff.',
      },
      {
        id: 'antigravity',
        label: 'Google Antigravity CLI (agy)',
        category: 'global',
        installed: availability[3],
        recommended: true,
        detail: 'Installs or updates agy with Google’s Antigravity native installer.',
        reason: 'Adds the current Google Antigravity CLI instead of Gemini CLI.',
      },
      {
        id: 'grok',
        label: 'Grok Build CLI',
        category: 'global',
        installed: availability[4],
        recommended: true,
        detail: 'Installs or updates Grok Build with xAI’s native installer.',
        reason: 'Enables local-project Grok Build workflows from the terminal.',
      },
      {
        id: 'gh',
        label: 'GitHub CLI',
        category: 'global',
        installed: availability[5],
        recommended: true,
        detail: 'Installs the GitHub CLI with the OS package manager.',
        reason: 'Useful for Gofer release, repo, and workflow tasks.',
      },
      {
        id: 'az',
        label: 'Azure CLI',
        category: 'global',
        installed: availability[6],
        recommended: true,
        detail: 'Installs the Azure CLI with the OS package manager.',
        reason: 'Useful for Gofer cloud and Azure-adjacent workflows.',
      }
    );

    return recommendations;
  }

  private async readPackageManifest(workspacePath: string): Promise<PackageJsonManifest | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content) as PackageJsonManifest;
    } catch {
      return null;
    }
  }

  private hasDependency(manifest: PackageJsonManifest | null, packageName: string): boolean {
    if (!manifest) {
      return false;
    }

    return Boolean(manifest.dependencies?.[packageName] || manifest.devDependencies?.[packageName]);
  }

  private getPackageManager(projectInfo: ProjectInfo, workspacePath: string): string | null {
    if (projectInfo.packageManager) {
      return projectInfo.packageManager;
    }

    if (existsSync(path.join(workspacePath, 'bun.lockb'))) {
      return 'bun';
    }

    if (existsSync(path.join(workspacePath, 'package.json'))) {
      return 'npm';
    }

    return null;
  }

  private isPlaywrightRecommended(projectInfo: ProjectInfo): boolean {
    const framework = projectInfo.framework ?? '';
    return ['Next.js', 'React', 'Vue', 'Angular', 'Svelte'].includes(framework);
  }

  private async isCommandAvailable(command: string, args: string[]): Promise<boolean> {
    return probeCommandAvailability(command, args);
  }

  private assertWorkspaceTrusted(): void {
    if (!vscode.workspace.isTrusted) {
      throw new Error(
        'Gofer can install optional developer tools only after you trust this VS Code workspace.'
      );
    }
  }

  private getInstallerPlatform(): NodeJS.Platform {
    return process.platform;
  }

  private async resolvePackagedInstaller(): Promise<PackagedInstaller> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
      throw new Error(`Cannot locate the installed ${EXTENSION_ID} extension package.`);
    }

    const platform = this.getInstallerPlatform();
    const definition = PACKAGED_INSTALLERS[platform === 'win32' ? 'windows' : 'posix'];
    const extensionRoot = await fs.realpath(extension.extensionPath);
    const declaredScriptPath = path.join(extensionRoot, ...definition.relativePath);

    let scriptPath: string;
    try {
      scriptPath = await fs.realpath(declaredScriptPath);
    } catch {
      throw new Error('Packaged optional tools installer not found.');
    }

    const relativeScriptPath = path.relative(extensionRoot, scriptPath);
    if (
      relativeScriptPath === '' ||
      relativeScriptPath === '..' ||
      relativeScriptPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeScriptPath)
    ) {
      throw new Error('Packaged optional tools installer resolves outside the extension package.');
    }

    const openFlags = constants.O_RDONLY | (platform === 'win32' ? 0 : constants.O_NOFOLLOW);
    let installerBytes: Buffer;
    let installerHandle: fs.FileHandle;
    try {
      installerHandle = await fs.open(declaredScriptPath, openFlags);
    } catch {
      throw new Error('Packaged optional tools installer could not be opened safely.');
    }
    try {
      const fileStatus = await installerHandle.stat();
      if (!fileStatus.isFile()) {
        throw new Error('Packaged optional tools installer is not a regular file.');
      }
      installerBytes = await installerHandle.readFile();
    } finally {
      await installerHandle.close();
    }

    const digest = createHash('sha256').update(installerBytes).digest('hex');
    if (digest !== definition.sha256) {
      throw new Error('Packaged optional tools installer failed SHA-256 verification.');
    }

    const cleanupRoot = await fs.mkdtemp(path.join(tmpdir(), 'gofer-optional-tools-'));
    const snapshotName = platform === 'win32' ? 'installer.ps1' : 'installer.sh';
    const verifiedScriptPath = path.join(cleanupRoot, snapshotName);
    try {
      await fs.writeFile(verifiedScriptPath, installerBytes, {
        flag: 'wx',
        mode: platform === 'win32' ? 0o600 : 0o700,
      });
    } catch (error) {
      await fs.rm(cleanupRoot, { recursive: true, force: true });
      throw error;
    }

    if (platform === 'win32') {
      const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
      const systemRoot = path.win32.isAbsolute(windowsRoot) ? windowsRoot : 'C:\\Windows';
      return {
        executable: path.win32.join(
          systemRoot,
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe'
        ),
        scriptPath: verifiedScriptPath,
        cleanupRoot,
        platform: 'windows',
        argumentPrefix: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
        ],
      };
    }

    return {
      executable: '/bin/bash',
      scriptPath: verifiedScriptPath,
      cleanupRoot,
      argumentPrefix: [],
      platform: 'posix',
    };
  }
}
