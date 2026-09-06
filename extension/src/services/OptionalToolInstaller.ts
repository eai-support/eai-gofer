import { assertNotRetiredSurface, isAntigravitySurface } from '../config/runtimeSurface';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ProjectDetector, type ProjectInfo } from './ProjectDetector';

export type OptionalToolId =
  | 'stryker'
  | 'playwright'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'antigravity-desktop'
  | 'gh'
  | 'az';

export interface OptionalToolRecommendation {
  id: OptionalToolId;
  label: string;
  category: 'repo' | 'global';
  installed: boolean;
  /** False excludes recognized surfaces without an approved installer. */
  installSupported?: boolean;
  verification?: 'version-only' | 'unverified';
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

@injectable()
export class OptionalToolInstaller {
  constructor(private readonly logger: Logger) {}

  public async promptForRecommendedTools(workspacePath: string): Promise<void> {
    const recommendations = await this.getRecommendations(workspacePath);
    const missingRecommendedTools = recommendations.filter(
      (tool): boolean => !tool.installed && tool.recommended && tool.installSupported !== false
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
    const recommendations = await this.getRecommendations(workspacePath);
    const missingTools = recommendations.filter(
      (tool): boolean => !tool.installed && tool.installSupported !== false
    );

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

    for (const toolId of toolIds) {
      assertNotRetiredSurface(toolId);
      if (isAntigravitySurface(toolId)) {
        throw new Error(
          `${toolId}: automatic installation is not verified. No installer was launched.`
        );
      }
    }
    const scriptPath = this.getScriptPath(workspacePath);
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`Optional tools installer script not found: ${scriptPath}`);
    }

    const toolsCsv = toolIds.join(',');
    this.logger.info('OptionalToolInstaller', 'Launching optional tools installer', {
      workspacePath,
      toolIds,
      scriptPath,
    });

    const terminal = vscode.window.createTerminal({
      name: 'Gofer Optional Tools',
      cwd: vscode.Uri.file(workspacePath),
    });

    terminal.show(true);
    terminal.sendText(this.buildTerminalCommand(scriptPath, workspacePath, toolsCsv));

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
      this.isCommandAvailable('agy', ['--version']),
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
        detail: 'Installs @anthropic-ai/claude-code globally via npm.',
        reason: 'Enables Claude-based Gofer workflows from the terminal.',
      },
      {
        id: 'codex',
        label: 'OpenAI Codex CLI',
        category: 'global',
        installed: availability[1],
        recommended: true,
        detail: 'Installs @openai/codex-cli globally via npm.',
        reason: 'Enables Codex-based Gofer workflows from the terminal.',
      },
      {
        id: 'antigravity',
        label: 'Google Antigravity CLI (agy)',
        category: 'global',
        installed: availability[2],
        recommended: false,
        installSupported: false,
        verification: availability[2] ? 'version-only' : 'unverified',
        detail: 'Automatic Gofer installation is not verified.',
        reason: 'Version discovery does not verify authentication or native Gofer execution.',
      },
      {
        id: 'antigravity-desktop',
        label: 'Google Antigravity Desktop',
        category: 'global',
        installed: false,
        recommended: false,
        installSupported: false,
        verification: 'unverified',
        detail: 'Desktop availability and installation are not verified.',
        reason: 'Do not infer desktop availability from the agy CLI.',
      },
      {
        id: 'gh',
        label: 'GitHub CLI',
        category: 'global',
        installed: availability[3],
        recommended: true,
        detail: 'Installs the GitHub CLI with the OS package manager.',
        reason: 'Useful for Gofer release, repo, and workflow tasks.',
      },
      {
        id: 'az',
        label: 'Azure CLI',
        category: 'global',
        installed: availability[4],
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
    return new Promise<boolean>((resolve) => {
      execFile(
        command,
        args,
        {
          timeout: 5000,
          ...(command === 'agy'
            ? {
                shell: false,
                maxBuffer: 1024 * 1024,
                env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true' },
              }
            : {}),
        },
        (error) => {
          if (!error) {
            resolve(true);
            return;
          }

          const typedError = error as NodeJS.ErrnoException;
          if (typedError.code === 'ENOENT' || command === 'agy') {
            resolve(false);
            return;
          }

          resolve(true);
        }
      );
    });
  }

  private getScriptPath(workspacePath: string): string {
    if (process.platform === 'win32') {
      return path.join(
        workspacePath,
        '.specify',
        'scripts',
        'powershell',
        'install-optional-tools.ps1'
      );
    }

    return path.join(workspacePath, '.specify', 'scripts', 'bash', 'install-optional-tools.sh');
  }

  private buildTerminalCommand(
    scriptPath: string,
    workspacePath: string,
    toolsCsv: string
  ): string {
    if (process.platform === 'win32') {
      return (
        `powershell -ExecutionPolicy Bypass -File ${this.quoteForPowerShell(scriptPath)} ` +
        `-WorkspacePath ${this.quoteForPowerShell(workspacePath)} ` +
        `-Tools ${this.quoteForPowerShell(toolsCsv)}`
      );
    }

    return (
      `bash ${this.quoteForPosix(scriptPath)} ` +
      `--workspace-path ${this.quoteForPosix(workspacePath)} ` +
      `--tools ${this.quoteForPosix(toolsCsv)}`
    );
  }

  private quoteForPosix(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private quoteForPowerShell(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
