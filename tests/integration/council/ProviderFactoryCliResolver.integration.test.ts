import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type WorkflowProfile } from '../../../extension/src/config/workflowProfile';
import { CodexCLIProvider } from '../../../extension/src/council/providers/cli/CodexCLIProvider';
import { ClaudeCodeCLIProvider } from '../../../extension/src/council/providers/cli/ClaudeCodeCLIProvider';
import { ProviderFactoryCliResolver } from '../../../extension/src/council/providers/ProviderFactoryCliResolver';

interface MockConfiguration {
  get: <T>(key: string, defaultValue?: T) => T;
}

async function createFakeCliCommand(
  directoryPath: string,
  commandName: string,
  version: string
): Promise<string> {
  const commandPath = path.join(directoryPath, commandName);
  const commandBody = [
    '#!/usr/bin/env bash',
    'if [ "$1" = "--version" ]; then',
    `  echo "${commandName} ${version}"`,
    '  exit 0',
    'fi',
    'if [ "$1" = "--help" ]; then',
    `  echo "${commandName} help"`,
    '  exit 0',
    'fi',
    'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
    '  echo "authenticated"',
    '  exit 0',
    'fi',
    'if [ "$1" = "login" ] && [ "$2" = "status" ]; then',
    '  echo "logged in"',
    '  exit 0',
    'fi',
    'echo "unsupported command"',
    'exit 1',
    '',
  ].join('\n');

  await fs.writeFile(commandPath, commandBody, 'utf8');
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

describe('ProviderFactoryCliResolver integration', () => {
  let fixtureDirectory: string;
  let configurationValues: Map<string, string>;
  let mockConfiguration: MockConfiguration;

  beforeEach(async (): Promise<void> => {
    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-cli-resolver-'));
    configurationValues = new Map<string, string>();
    mockConfiguration = {
      get: <T>(key: string, defaultValue?: T): T => {
        if (configurationValues.has(key)) {
          return configurationValues.get(key) as T;
        }
        return defaultValue as T;
      },
    };

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      mockConfiguration as unknown as vscode.WorkspaceConfiguration
    );
  });

  afterEach(async (): Promise<void> => {
    await fs.rm(fixtureDirectory, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('auto-detects the configured default CLI using real health checks', async (): Promise<void> => {
    const claudeCommand = await createFakeCliCommand(fixtureDirectory, 'claude-fake', '1.2.3');
    const codexCommand = await createFakeCliCommand(fixtureDirectory, 'codex-fake', '2.3.4');

    configurationValues.set('defaultCLI', 'codex');
    configurationValues.set('claudeCodeCommand', claudeCommand);
    configurationValues.set('codexCommand', codexCommand);

    const resolver = new ProviderFactoryCliResolver({
      logger: {
        info: (): void => {},
        warn: (): void => {},
      },
      createCLIProvider: async (): Promise<CodexCLIProvider> => {
        return new CodexCLIProvider(codexCommand, 'codex');
      },
      resolveWorkflowProfileContext: (workflowProfile?: WorkflowProfile): WorkflowProfile =>
        workflowProfile ?? 'standard',
    });

    const detected = await resolver.autoDetectCLI('standard');
    expect(detected).toBe('codex');
  });

  it('uses preferred provider path with workflow profile context', async (): Promise<void> => {
    const claudeCommand = await createFakeCliCommand(fixtureDirectory, 'claude-fake', '1.2.3');
    const codexCommand = await createFakeCliCommand(fixtureDirectory, 'codex-fake', '2.3.4');

    configurationValues.set('cliProvider', 'codex');
    configurationValues.set('defaultCLI', 'auto');
    configurationValues.set('claudeCodeCommand', claudeCommand);
    configurationValues.set('codexCommand', codexCommand);

    const createCLIProvider = vi.fn(
      async (
        cliType: 'claude' | 'codex',
        command?: string,
        workflowProfile?: WorkflowProfile
      ): Promise<ClaudeCodeCLIProvider | CodexCLIProvider> => {
        void workflowProfile;
        if (cliType === 'claude') {
          return new ClaudeCodeCLIProvider(command ?? claudeCommand, 'claude');
        }
        return new CodexCLIProvider(command ?? codexCommand, 'codex');
      }
    );

    const resolver = new ProviderFactoryCliResolver({
      logger: {
        info: (): void => {},
        warn: (): void => {},
      },
      createCLIProvider,
      resolveWorkflowProfileContext: (workflowProfile?: WorkflowProfile): WorkflowProfile =>
        workflowProfile ?? 'standard',
    });

    const provider = await resolver.getCLIProvider('enterpriseai');
    expect(provider.id).toBe('codex-cli');
    expect(createCLIProvider).toHaveBeenCalledWith('codex', undefined, 'enterpriseai');
  });

  it('falls back to available CLI in auto mode when primary command is unavailable', async (): Promise<void> => {
    const codexCommand = await createFakeCliCommand(fixtureDirectory, 'codex-fake', '2.3.4');

    configurationValues.set('cliProvider', 'auto');
    configurationValues.set('defaultCLI', 'auto');
    configurationValues.set('claudeCodeCommand', path.join(fixtureDirectory, 'claude-missing'));
    configurationValues.set('codexCommand', codexCommand);

    const resolver = new ProviderFactoryCliResolver({
      logger: {
        info: (): void => {},
        warn: (): void => {},
      },
      createCLIProvider: async (
        cliType: 'claude' | 'codex',
        command?: string
      ): Promise<ClaudeCodeCLIProvider | CodexCLIProvider> => {
        if (cliType === 'claude') {
          return new ClaudeCodeCLIProvider(command ?? 'claude', 'claude');
        }
        return new CodexCLIProvider(command ?? codexCommand, 'codex');
      },
      resolveWorkflowProfileContext: (workflowProfile?: WorkflowProfile): WorkflowProfile =>
        workflowProfile ?? 'standard',
    });

    const provider = await resolver.getCLIProvider('standard');
    expect(provider.id).toBe('codex-cli');
  });
});
