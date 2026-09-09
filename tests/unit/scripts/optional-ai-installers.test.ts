import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  getTrustedWindowsPowerShellExecutable,
  OptionalToolInstaller,
  probeCommandAvailability,
} from '../../../extension/src/services/OptionalToolInstaller';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

beforeEach(() => {
  (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
  vi.mocked(vscode.extensions.getExtension).mockReset();
  vi.mocked(vscode.tasks.executeTask).mockReset();
  vi.mocked(vscode.tasks.executeTask).mockResolvedValue({} as vscode.TaskExecution);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('optional AI tool installers', () => {
  test.each([
    [['--tools'], 'Missing value for --tools.'],
    [['--workspace-path', '--tools', 'claude'], 'Missing value for --workspace-path.'],
    [
      ['--not-a-real-option=token\u001b[31m'],
      'Unknown argument. Expected --workspace-path or --tools.',
    ],
  ] as const)(
    'Bash rejects malformed arguments without reflecting raw input',
    async (args, message) => {
      let failure: (Error & { code?: number; stderr?: string }) | undefined;
      try {
        await execFileAsync('bash', [
          resolve(root, '.specify/scripts/bash/install-optional-tools.sh'),
          ...args,
        ]);
      } catch (error) {
        failure = error as Error & { code?: number; stderr?: string };
      }
      expect(failure).toMatchObject({ code: 64 });
      expect(failure?.stderr).toContain(message);
      expect(failure?.stderr).not.toContain('token');
      expect(failure?.stderr).not.toContain('\u001b');
    }
  );

  test.each(['ENOENT', 'ETIMEDOUT', 'EACCES', '1'])(
    'reports failed executable probe %s as unavailable',
    async (code) => {
      const execute = vi.fn((_command, _args, _options, callback) =>
        callback(Object.assign(new Error('failed'), { code }))
      );
      await expect(probeCommandAvailability('provider', ['--version'], execute)).resolves.toBe(
        false
      );
    }
  );

  test('uses current provider sources with bounded verified execution', async () => {
    const bash = await readFile(
      resolve(root, '.specify/scripts/bash/install-optional-tools.sh'),
      'utf8'
    );
    const powershell = await readFile(
      resolve(root, '.specify/scripts/powershell/install-optional-tools.ps1'),
      'utf8'
    );
    for (const url of [
      'https://antigravity.google/cli/install.sh',
      'https://claude.ai/install.sh',
      'https://chatgpt.com/codex/install.sh',
      'https://x.ai/cli/install.sh',
    ])
      expect(bash).toContain(url);
    for (const url of [
      'https://antigravity.google/cli/install.ps1',
      'https://claude.ai/install.ps1',
      'https://chatgpt.com/codex/install.ps1',
      'https://x.ai/cli/install.ps1',
    ])
      expect(powershell).toContain(url);
    expect(bash).toContain("--proto-redir '=https'");
    expect(bash).toContain('--max-filesize 1048576');
    expect(bash).toContain('INSTALLER_TIMEOUT_SECONDS=900');
    expect(bash).toContain('/dev/fd/');
    expect(bash).toContain('terminate_process_tree');
    expect(bash).not.toMatch(/curl[^\n]*\|[^\n]*(?:bash|sh)/);
    expect(powershell).toContain('$handler.AllowAutoRedirect = $false');
    expect(powershell).toContain('$httpClient.MaxResponseContentBufferSize = 1MB');
    expect(powershell).toContain(
      "$startInfo.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -'"
    );
    expect(powershell).toContain('EnvironmentVariables.Clear()');
    expect(powershell).toContain('Stop-InstallerProcess -Process $installerProcess');
    expect(powershell).not.toContain('Invoke-Expression');
    for (const source of [bash, powershell]) {
      expect(source).not.toContain('@google/gemini-cli');
      expect(source).not.toContain('@openai/codex-cli');
      expect(source).not.toContain('@anthropic-ai/claude-code');
    }
  });

  test('PowerShell safely handles a null exception message', async () => {
    const powershell = await readFile(
      resolve(root, '.specify/scripts/powershell/install-optional-tools.ps1'),
      'utf8'
    );
    const diagnosticFunction = powershell.match(
      /function ConvertTo-SafeDiagnostic \{[\s\S]*?\n\}\n\nfunction Invoke-Step/
    )?.[0];
    expect(diagnosticFunction).toBeDefined();
    expect(diagnosticFunction).toContain('if ([string]::IsNullOrEmpty($Message)) {');
    expect(diagnosticFunction).toContain("return 'No diagnostic details were provided.'");

    if (
      !(await probeCommandAvailability('pwsh', ['-NoLogo', '-NoProfile', '-Command', 'exit 0']))
    ) {
      return;
    }

    const fixture = await mkdtemp(resolve(tmpdir(), 'gofer-safe-diagnostic-'));
    temporaryDirectories.push(fixture);
    const harness = resolve(fixture, 'null-diagnostic.ps1');
    await writeFile(
      harness,
      `$WorkspacePath = 'C:\\workspace'\n${diagnosticFunction!.replace(
        /\n\nfunction Invoke-Step$/,
        ''
      )}\nConvertTo-SafeDiagnostic -Message $null\n`
    );

    const { stdout } = await execFileAsync('pwsh', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      harness,
    ]);
    expect(stdout.trim()).toBe('No diagnostic details were provided.');
  });

  test('fails with targeted Azure feed guidance when apt cannot resolve azure-cli', async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), 'gofer-azure-apt-'));
    temporaryDirectories.push(fixture);
    const bin = resolve(fixture, 'bin');
    await mkdir(bin);
    await writeFile(resolve(bin, 'apt-cache'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await writeFile(resolve(bin, 'apt-get'), '#!/bin/sh\necho called >> "$APT_MARKER"\n', {
      mode: 0o755,
    });
    const marker = resolve(fixture, 'apt-get-called');

    let failure: (Error & { code?: number; stdout?: string; stderr?: string }) | undefined;
    try {
      await execFileAsync(
        '/bin/bash',
        [
          resolve(root, '.specify/scripts/bash/install-optional-tools.sh'),
          '--workspace-path',
          fixture,
          '--tools',
          'az',
        ],
        // Keep the probe hermetic: hosted Linux runners commonly have `az`
        // preinstalled, which would otherwise bypass the apt branch entirely.
        { env: { PATH: bin, APT_MARKER: marker } }
      );
    } catch (error) {
      failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    }

    expect(failure).toMatchObject({ code: 1 });
    expect(`${failure?.stdout ?? ''}\n${failure?.stderr ?? ''}`).toContain(
      "Configure Microsoft's signed Azure CLI apt repository, then rerun Gofer"
    );
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('keeps every packaged and public installer mirror byte-identical', async () => {
    for (const [platform, resourceDirectory, file] of [
      ['bash', 'bash-scripts', 'install-optional-tools.sh'],
      ['powershell', 'powershell-scripts', 'install-optional-tools.ps1'],
    ] as const) {
      const canonical = await readFile(resolve(root, '.specify/scripts', platform, file));
      const mirrors = [
        resolve(root, 'extension/resources', resourceDirectory, file),
        resolve(root, 'plugins/eai-gofer/.specify/scripts', platform, file),
        resolve(root, 'plugins/eai-gofer/plugins/eai-gofer/.specify/scripts', platform, file),
        resolve(
          root,
          'docs-site/static/releases/plugins/eai-gofer/.specify/scripts',
          platform,
          file
        ),
        resolve(
          root,
          'docs-site/static/releases/plugins/eai-gofer/plugins/eai-gofer/.specify/scripts',
          platform,
          file
        ),
      ];
      for (const mirror of mirrors) {
        expect(await readFile(mirror)).toEqual(canonical);
      }
    }
  });

  test('executes an immutable verified snapshot instead of either mutable source path', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'gofer-workspace-'));
    temporaryDirectories.push(workspace);
    const malicious = resolve(workspace, '.specify/scripts/bash/install-optional-tools.sh');
    await mkdir(resolve(malicious, '..'), { recursive: true });
    await writeFile(malicious, '#!/bin/sh\nexit 99\n');
    await chmod(malicious, 0o755);
    const extensionPath = resolve(root, 'extension');
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({ extensionPath } as never);
    await new OptionalToolInstaller({ info: vi.fn() } as never).runInstaller(workspace, ['claude']);
    const task = vi.mocked(vscode.tasks.executeTask).mock.calls[0]?.[0] as vscode.Task;
    const execution = task.execution as vscode.ProcessExecution;
    const snapshotPath = execution.args.find((argument) => argument.endsWith('installer.sh'));
    expect(snapshotPath).toBeDefined();
    expect(snapshotPath).not.toBe(
      resolve(extensionPath, 'resources/bash-scripts/install-optional-tools.sh')
    );
    expect(execution.args).not.toContain(malicious);
    expect(await readFile(snapshotPath!, 'utf8')).toBe(
      await readFile(
        resolve(extensionPath, 'resources/bash-scripts/install-optional-tools.sh'),
        'utf8'
      )
    );
  });

  test('rejects altered and escaping packaged scripts', async () => {
    const extensionRoot = await mkdtemp(resolve(tmpdir(), 'gofer-extension-'));
    temporaryDirectories.push(extensionRoot);
    const resources = resolve(extensionRoot, 'resources/bash-scripts');
    await mkdir(resources, { recursive: true });
    const script = resolve(resources, 'install-optional-tools.sh');
    await writeFile(script, '#!/bin/sh\nexit 0\n');
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      extensionPath: extensionRoot,
    } as never);
    const installer = new OptionalToolInstaller({ info: vi.fn() } as never);
    await expect(installer.runInstaller(extensionRoot, ['claude'])).rejects.toThrow(
      'failed SHA-256 verification'
    );
    await rm(script);
    await symlink(resolve(root, '.specify/scripts/bash/install-optional-tools.sh'), script);
    await expect(installer.runInstaller(extensionRoot, ['claude'])).rejects.toThrow(
      'outside the extension'
    );
  });

  test('embedded digests match generated resources', async () => {
    const source = await readFile(
      resolve(root, 'extension/src/services/OptionalToolInstaller.ts'),
      'utf8'
    );
    for (const relative of [
      'extension/resources/bash-scripts/install-optional-tools.sh',
      'extension/resources/powershell-scripts/install-optional-tools.ps1',
    ]) {
      const digest = createHash('sha256')
        .update(await readFile(resolve(root, relative)))
        .digest('hex');
      expect(source).toContain(digest);
    }
  });

  test('binds file validation to one no-follow handle before staging execution bytes', async () => {
    const source = await readFile(
      resolve(root, 'extension/src/services/OptionalToolInstaller.ts'),
      'utf8'
    );
    expect(source).toContain(
      "constants.O_RDONLY | (platform === 'win32' ? 0 : constants.O_NOFOLLOW)"
    );
    expect(source).toContain('await installerHandle.stat()');
    expect(source).toContain('await installerHandle.readFile()');
    expect(source).toContain("flag: 'wx'");
    expect(source).not.toContain('await fs.readFile(scriptPath)');
  });

  test('handles asynchronous installer snapshot cleanup failures', async () => {
    const source = await readFile(
      resolve(root, 'extension/src/services/OptionalToolInstaller.ts'),
      'utf8'
    );
    expect(source).toContain('void this.cleanupInstallerSnapshot(installer.cleanupRoot)');
    expect(source).toContain('await this.cleanupInstallerSnapshot(installer.cleanupRoot)');
    expect(source).toContain("this.logger.warn('OptionalToolInstaller'");
    expect(source).not.toContain('void fs.rm(installer.cleanupRoot');
  });

  test('does not trust hostile environment variables for the Windows interpreter', () => {
    const originalSystemRoot = process.env.SystemRoot;
    const originalWindir = process.env.WINDIR;
    process.env.SystemRoot = 'C:\\attacker-controlled';
    process.env.WINDIR = 'D:\\also-attacker-controlled';
    try {
      expect(getTrustedWindowsPowerShellExecutable()).toBe(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      );
    } finally {
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      if (originalWindir === undefined) delete process.env.WINDIR;
      else process.env.WINDIR = originalWindir;
    }
  });

  test('matches fast task completion by task identity before executeTask resolves', async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), 'gofer-workspace-'));
    temporaryDirectories.push(workspace);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      extensionPath: resolve(root, 'extension'),
    } as never);
    const dispose = vi.fn();
    let endTask: ((event: vscode.TaskProcessEndEvent) => void) | undefined;
    vi.mocked(vscode.tasks.onDidEndTaskProcess).mockImplementation((listener) => {
      endTask = listener;
      return { dispose };
    });
    vi.mocked(vscode.tasks.executeTask).mockImplementation(async (task) => {
      endTask?.({ execution: { task } } as vscode.TaskProcessEndEvent);
      return { task } as vscode.TaskExecution;
    });

    await new OptionalToolInstaller({ info: vi.fn(), warn: vi.fn() } as never).runInstaller(
      workspace,
      ['claude']
    );

    expect(dispose).toHaveBeenCalledOnce();
  });
});
