/**
 * Command Registration Tests
 *
 * Validates that all commands declared in package.json are properly registered
 * in extension.ts, CommandRegistry.ts, or other command files.
 *
 * After T020 refactoring, commands are split across:
 * - extension.ts: registerGlobalCommands() for welcome view commands
 * - CommandRegistry.ts: registerAll() for workspace-specific commands
 * - memoryCommands.ts, specCommands.ts: domain commands
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as path from 'path';
import { CONFIG_KEYS, DEFAULTS } from '../../extension/src/config';

// Unmock fs for this test file - we need real file system access
vi.unmock('fs');
vi.unmock('fs/promises');

// Import real fs
import { readFileSync } from 'fs';

/**
 * TypeScript interfaces for package.json structure
 */
interface CommandDefinition {
  command: string;
  title: string;
  icon?: string;
}

interface ViewDefinition {
  id: string;
  name: string;
  contextualTitle?: string;
}

interface WelcomeViewDefinition {
  view: string;
  contents: string;
}

interface MenuDefinition {
  command: string;
  when?: string;
  group?: string;
}

interface KeybindingDefinition {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

interface ChatPromptFileDefinition {
  path: string;
  when?: string;
}

interface ViewContainerDefinition {
  id: string;
  title: string;
  icon: string;
}

interface PackageJson {
  name: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  main: string;
  icon: string;
  categories: string[];
  engines: {
    vscode: string;
  };
  repository: {
    type: string;
    url: string;
  };
  activationEvents: string[];
  contributes: {
    chatPromptFiles: ChatPromptFileDefinition[];
    commands: CommandDefinition[];
    configuration: {
      properties: Record<string, { default?: unknown }>;
    };
    views: {
      [viewContainerId: string]: ViewDefinition[];
    };
    viewsWelcome?: WelcomeViewDefinition[];
    viewsContainers: {
      activitybar: ViewContainerDefinition[];
    };
    menus: {
      'view/title': MenuDefinition[];
      commandPalette?: MenuDefinition[];
    };
    keybindings: KeybindingDefinition[];
  };
}

const COMMAND_DOC_PATHS = [
  '../../README.md',
  '../../extension/README.md',
  '../../.tech-docs/README.md',
  '../../.tech-docs/overview.md',
  '../../.tech-docs/data-model.md',
];
const COMMAND_ID_DOC_PATHS = ['../../.tech-docs/review/patterns.md'];
const COMMAND_PALETTE_DOC_PATHS = [
  '../../README.md',
  '../../extension/README.md',
  '../../.tech-docs/overview.md',
];

const SETTINGS_DOC_PATHS = [
  '../../README.md',
  '../../extension/README.md',
  '../../.tech-docs/README.md',
  '../../.tech-docs/configuration.md',
];
const SETTINGS_DEFAULT_DOC_PATHS = ['../../.tech-docs/configuration.md'];
const LEGACY_DOC_PREFIX_PATHS = [
  '../../.tech-docs/architecture.md',
  '../../.tech-docs/review/patterns.md',
];
const DELETED_LEGACY_DOC_PATHS = ['docs/migration-guide.md'];
const REMOVED_DIRECT_PROVIDER_SETTINGS = [
  'gofer.anthropicApiKey',
  'gofer.googleApiKey',
  'gofer.openaiApiKey',
  'gofer.anthropicAdminApiKey',
  'gofer.openaiAdminApiKey',
  'gofer.aiUsage.useApiClient',
  'gofer.aiUsage.api.pollingInterval',
  'gofer.claudeCodeMode',
  'gofer.autonomousMode',
  'gofer.enterpriseAiUseExternalReferences',
  'gofer.autonomous.showTerminals',
  'gofer.autonomous.maxRetries',
  'gofer.autonomous.tokenWarningThreshold',
  'gofer.autonomous.tokenActionThreshold',
  'gofer.autonomous.compactionThreshold',
  'gofer.autonomous.questionTimeout',
  'gofer.autonomous.runFinalValidation',
  'gofer.autonomous.validateConstitution',
  'gofer.autonomous.enableEngineeringReview',
  'gofer.autonomous.enablePerformanceReview',
  'gofer.autonomous.engineeringReviewMinCompletion',
  'gofer.autonomous.engineeringReviewMaxCompletion',
  'gofer.autonomous.performanceReviewMinCompletion',
  'gofer.autonomous.engineeringReviewPrompt',
  'gofer.autonomous.performanceReviewPrompt',
  'gofer.autonomous.haikuSystemPrompt',
  'gofer.autonomous.haikuUserPromptTemplate',
  'gofer.yoloSlopReduction.enabled',
  'gofer.yoloSlopReduction.notifyEvery',
  'gofer.contextWindow.autoExecuteSave',
  'gofer.contextWindow.autoSaveThreshold',
  'gofer.contextWindow.autoResumeAfterSave',
  'gofer.contextWindow.continuousSlopReduction.enabled',
  'gofer.contextWindow.continuousSlopReduction.intervalMs',
  'gofer.scopeGuard.mode',
  'gofer.budgets.maxCostUsd',
  'gofer.budgets.maxTokensPerRun',
  'gofer.budgets.enforcementMode',
  'gofer.memory.coverageThreshold',
  'gofer.diagnostics.resourceSnapshots.enabled',
  'gofer.diagnostics.resourceSnapshots.intervalMs',
];
const REMOVED_CLAUDE_LAUNCHER_COMMANDS = [
  'gofer.startClaudeCode',
  'gofer.stopClaudeCode',
  'gofer.pauseClaudeCode',
  'gofer.resumeClaudeCode',
  'gofer.showCouncilStatus',
];
const REMOVED_DIRECT_PROVIDER_SDKS = [
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  'openai',
  'twilio',
];
const PACKAGE_JSON_PATHS = [
  '../../package.json',
  '../../extension/package.json',
  '../../language-server/package.json',
  '../../extension/language-server/package.json',
];

const COMMAND_REFERENCE_PATTERN = /(?:\*\*|`)(Gofer:[^`*]+?)(?:\*\*|`)/g;
const COMMAND_ID_REFERENCE_PATTERN = /`(gofer\.[A-Za-z][A-Za-z0-9]+)`/g;
const COMMAND_PALETTE_REFERENCE_PATTERN = /Command Palette[^\n`]*`(Gofer:[^`]+)`/g;
const SETTINGS_REFERENCE_PATTERN = /(?:`|")(gofer\.[A-Za-z0-9.]+)(?:`|")/g;
const SETTINGS_DEFAULT_TABLE_ROW_PATTERN =
  /^\|\s*`(gofer\.[^`]+)`\s*\|\s*[^|]+\|\s*`([^`]*)`\s*\|/gm;
const LEGACY_DOC_REFERENCE_PATTERN = /\b(?:eaigofer_|eaiGofer\.)[A-Za-z0-9_.]*/g;
const DIRECT_CONFIG_DEFAULT_SOURCE_PATHS = [
  '../../extension/src/config.ts',
  '../../extension/src/extension.ts',
  '../../extension/src/services/EventHandlers.ts',
  '../../extension/src/services/InitializationService.ts',
  '../../extension/src/webviewHelpers.ts',
  '../../extension/src/ui/AIUsageStatusBar.ts',
  '../../extension/src/ui/GoferActivityStatusBar.ts',
  '../../extension/src/ui/ContextHealthStatusBar.ts',
  '../../extension/src/autonomous/AIUsageMonitor.ts',
  '../../extension/src/config/workflowProfile.ts',
  '../../extension/src/autonomousCommands.ts',
  '../../extension/src/mcpConfig.ts',
  '../../extension/src/council/providers/ProviderFactory.ts',
  '../../extension/src/council/providers/ProviderFactoryCliResolver.ts',
];
const DIRECT_CONFIG_GET_PATTERN =
  /\.get<[^>]+>\(\s*['"]([^'"]+)['"]\s*,\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|true|false|-?\d+(?:\.\d+)?)\s*\)/g;
const JSON_CODE_BLOCK_PATTERN = /```json\s*([\s\S]*?)```/g;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(__dirname, relativePath), 'utf-8');
}

function getDocumentedCommandTitles(relativePath: string): string[] {
  const content = normalizeWhitespace(readWorkspaceFile(relativePath));

  return Array.from(
    new Set(
      Array.from(content.matchAll(COMMAND_REFERENCE_PATTERN), (match) =>
        normalizeWhitespace(match[1])
      )
    )
  );
}

function getDocumentedCommandIds(relativePath: string): string[] {
  const content = readWorkspaceFile(relativePath);

  return Array.from(
    new Set(Array.from(content.matchAll(COMMAND_ID_REFERENCE_PATTERN), (match) => match[1]))
  );
}

function getDocumentedCommandPaletteTitles(relativePath: string): string[] {
  const content = readWorkspaceFile(relativePath);

  return Array.from(
    new Set(
      Array.from(content.matchAll(COMMAND_PALETTE_REFERENCE_PATTERN), (match) =>
        normalizeWhitespace(match[1])
      )
    )
  );
}

function getDocumentedSettings(relativePath: string): string[] {
  const content = readWorkspaceFile(relativePath);

  return Array.from(
    new Set(Array.from(content.matchAll(SETTINGS_REFERENCE_PATTERN), (match) => match[1]))
  );
}

interface DocumentedSettingValue {
  setting: string;
  value: unknown;
}

function getDocumentedSettingDefaults(relativePath: string): DocumentedSettingValue[] {
  const content = readWorkspaceFile(relativePath);
  const documentedDefaults = new Map<string, unknown>();

  for (const match of content.matchAll(SETTINGS_DEFAULT_TABLE_ROW_PATTERN)) {
    documentedDefaults.set(match[1], parseLiteralValue(match[2]));
  }

  return Array.from(documentedDefaults, ([setting, value]) => ({ setting, value }));
}

function getDocumentedSettingsFromJsonBlocks(relativePath: string): DocumentedSettingValue[] {
  const content = readWorkspaceFile(relativePath);
  const documentedSettings = new Map<string, unknown>();

  for (const match of content.matchAll(JSON_CODE_BLOCK_PATTERN)) {
    const parsedBlock = JSON.parse(match[1]) as Record<string, unknown>;

    for (const [setting, value] of Object.entries(parsedBlock)) {
      if (setting.startsWith('gofer.')) {
        documentedSettings.set(setting, value);
      }
    }
  }

  return Array.from(documentedSettings, ([setting, value]) => ({ setting, value }));
}

function getLegacyDocReferences(relativePath: string): string[] {
  const content = readWorkspaceFile(relativePath);

  return Array.from(
    new Set(Array.from(content.matchAll(LEGACY_DOC_REFERENCE_PATTERN), (match) => match[0]))
  );
}

interface DirectConfigFallback {
  key: string;
  fallback: unknown;
}

function parseLiteralValue(literal: string): unknown {
  const trimmed = literal.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === '[]') {
    return [];
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function collectDirectConfigFallbacks(relativePath: string): DirectConfigFallback[] {
  const source = readWorkspaceFile(relativePath);

  return Array.from(source.matchAll(DIRECT_CONFIG_GET_PATTERN), (match) => ({
    key: match[1],
    fallback: parseLiteralValue(match[2]),
  }));
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectDocumentedSettingValueMismatches(
  properties: Record<string, { default?: unknown }>,
  relativePath: string,
  documentedValues: DocumentedSettingValue[],
  valueLabel: string
): string[] {
  return documentedValues.flatMap(({ setting, value }) => {
    if (!Object.prototype.hasOwnProperty.call(properties, setting)) {
      return [`${relativePath}: ${setting} is not declared in extension/package.json`];
    }

    const manifestDefault = properties[setting]?.default;
    if (valuesMatch(value, manifestDefault)) {
      return [];
    }

    return [
      `${relativePath}: ${setting} ${valueLabel} ${JSON.stringify(value)} !== manifest default ${JSON.stringify(manifestDefault)}`,
    ];
  });
}

describe('Command Registration Validation', () => {
  let packageJson: PackageJson;
  let extensionSource: string;
  let commandRegistrySource: string;
  let memoryCommandsSource: string;
  let specCommandsSource: string;
  /** Combined source of all command registration files */
  let allCommandSources: string;

  beforeAll(() => {
    // Read package.json
    const packagePath = path.join(__dirname, '../../extension/package.json');
    packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

    // Read extension.ts source
    const extensionPath = path.join(__dirname, '../../extension/src/extension.ts');
    extensionSource = readFileSync(extensionPath, 'utf-8');

    // Read CommandRegistry.ts (T020 refactoring target)
    const commandRegistryPath = path.join(
      __dirname,
      '../../extension/src/services/CommandRegistry.ts'
    );
    commandRegistrySource = readFileSync(commandRegistryPath, 'utf-8');

    // Read command files
    const memoryCommandsPath = path.join(
      __dirname,
      '../../extension/src/commands/memoryCommands.ts'
    );
    memoryCommandsSource = readFileSync(memoryCommandsPath, 'utf-8');

    const specCommandsPath = path.join(__dirname, '../../extension/src/commands/specCommands.ts');
    specCommandsSource = readFileSync(specCommandsPath, 'utf-8');

    // Read UI status bar sources (some commands are registered in status bar constructors)
    const aiUsageStatusBarPath = path.join(__dirname, '../../extension/src/ui/AIUsageStatusBar.ts');
    const aiUsageStatusBarSource = readFileSync(aiUsageStatusBarPath, 'utf-8');

    // Read additional command files (Feature 029)
    const migrateMemoriesPath = path.join(
      __dirname,
      '../../extension/src/commands/migrateMemories.ts'
    );
    const migrateMemoriesSource = readFileSync(migrateMemoriesPath, 'utf-8');

    const queryMemoryUsagePath = path.join(
      __dirname,
      '../../extension/src/commands/queryMemoryUsage.ts'
    );
    const queryMemoryUsageSource = readFileSync(queryMemoryUsagePath, 'utf-8');

    // Combined for convenience
    allCommandSources = [
      extensionSource,
      commandRegistrySource,
      memoryCommandsSource,
      specCommandsSource,
      aiUsageStatusBarSource,
      migrateMemoriesSource,
      queryMemoryUsageSource,
    ].join('\n');
  });

  it('should have commands declared in package.json', () => {
    expect(packageJson.contributes.commands).toBeDefined();
    expect(packageJson.contributes.commands.length).toBeGreaterThan(0);
  });

  it('should contribute Gofer prompt files as VS Code Copilot slash commands', () => {
    const promptFiles = packageJson.contributes.chatPromptFiles ?? [];
    const paths = promptFiles.map((entry) => entry.path);

    expect(paths).toEqual(expect.arrayContaining(['./resources/copilot-prompts/eai.prompt.md']));
    expect(paths).not.toContain('./resources/copilot-prompts/gofer.prompt.md');

    for (const promptPath of ['./resources/copilot-prompts/eai.prompt.md']) {
      const content = readWorkspaceFile(`../../extension/${promptPath.replace(/^\.\//, '')}`);
      expect(content).toContain('name:');
      expect(content).toContain('agent: agent');
      expect(content).not.toContain('agent: copilot-workspace');
    }
  });

  it('should keep exported config defaults aligned with manifest defaults', () => {
    const properties = packageJson.contributes.configuration.properties;
    const missingConfigKeys: string[] = [];
    const mismatches: string[] = [];

    for (const [defaultKey, expectedDefault] of Object.entries(DEFAULTS) as Array<
      [keyof typeof DEFAULTS, (typeof DEFAULTS)[keyof typeof DEFAULTS]]
    >) {
      const manifestKey = CONFIG_KEYS[defaultKey as keyof typeof CONFIG_KEYS];
      if (!manifestKey) {
        missingConfigKeys.push(String(defaultKey));
        continue;
      }

      const manifestDefault = properties[manifestKey]?.default;
      if (!valuesMatch(expectedDefault, manifestDefault)) {
        mismatches.push(
          `${manifestKey} default ${JSON.stringify(expectedDefault)} !== manifest default ${JSON.stringify(manifestDefault)}`
        );
      }
    }

    expect({ missingConfigKeys, mismatches }).toEqual({
      missingConfigKeys: [],
      mismatches: [],
    });
  });

  it('should keep manifest-backed direct runtime fallbacks aligned with manifest defaults', () => {
    const properties = packageJson.contributes.configuration.properties;
    const mismatches = new Set<string>();

    for (const relativePath of DIRECT_CONFIG_DEFAULT_SOURCE_PATHS) {
      for (const fallback of collectDirectConfigFallbacks(relativePath)) {
        const manifestKey = `gofer.${fallback.key}`;
        if (!Object.prototype.hasOwnProperty.call(properties, manifestKey)) {
          continue;
        }

        const manifestDefault = properties[manifestKey]?.default;
        if (!valuesMatch(fallback.fallback, manifestDefault)) {
          mismatches.add(
            `${relativePath}: ${manifestKey} fallback ${JSON.stringify(fallback.fallback)} !== manifest default ${JSON.stringify(manifestDefault)}`
          );
        }
      }
    }

    expect(Array.from(mismatches)).toEqual([]);
  });

  it('should keep documented command titles aligned with manifest commands', () => {
    const declaredCommandTitles = new Set(packageJson.contributes.commands.map((cmd) => cmd.title));
    const unexpectedTitles = COMMAND_DOC_PATHS.flatMap((relativePath) =>
      getDocumentedCommandTitles(relativePath)
        .filter((title) => !declaredCommandTitles.has(title))
        .map((title) => `${relativePath}: ${title}`)
    );

    expect(unexpectedTitles).toEqual([]);
  });

  it('should keep active command-id references aligned with manifest commands', () => {
    const declaredCommands = new Set(packageJson.contributes.commands.map((cmd) => cmd.command));
    const unexpectedCommandIds = COMMAND_ID_DOC_PATHS.flatMap((relativePath) =>
      getDocumentedCommandIds(relativePath)
        .filter((commandId) => !declaredCommands.has(commandId))
        .map((commandId) => `${relativePath}: ${commandId}`)
    );

    expect(unexpectedCommandIds).toEqual([]);
  });

  it('should keep command palette walkthroughs aligned with manifest commands', () => {
    const declaredCommandTitles = new Set(packageJson.contributes.commands.map((cmd) => cmd.title));
    const unexpectedCommandTitles = COMMAND_PALETTE_DOC_PATHS.flatMap((relativePath) =>
      getDocumentedCommandPaletteTitles(relativePath)
        .filter((title) => !declaredCommandTitles.has(title))
        .map((title) => `${relativePath}: ${title}`)
    );

    expect(unexpectedCommandTitles).toEqual([]);
  });

  it('should keep documented settings aligned with manifest properties', () => {
    const properties = packageJson.contributes.configuration.properties;
    const unexpectedSettings = SETTINGS_DOC_PATHS.flatMap((relativePath) =>
      getDocumentedSettings(relativePath)
        .filter((setting) => !Object.prototype.hasOwnProperty.call(properties, setting))
        .map((setting) => `${relativePath}: ${setting}`)
    );

    expect(unexpectedSettings).toEqual([]);
  });

  it('should keep configuration guide defaults aligned with manifest defaults', () => {
    const properties = packageJson.contributes.configuration.properties;
    const defaultMismatches = SETTINGS_DEFAULT_DOC_PATHS.flatMap((relativePath) =>
      collectDocumentedSettingValueMismatches(
        properties,
        relativePath,
        getDocumentedSettingDefaults(relativePath),
        'documented default'
      )
    );

    expect(defaultMismatches).toEqual([]);
  });

  it('should keep README configuration examples aligned with manifest defaults', () => {
    const properties = packageJson.contributes.configuration.properties;
    const examplePaths = ['../../README.md', '../../extension/README.md'];
    const exampleMismatches = examplePaths.flatMap((relativePath) =>
      collectDocumentedSettingValueMismatches(
        properties,
        relativePath,
        getDocumentedSettingsFromJsonBlocks(relativePath),
        'documented example'
      )
    );

    expect(exampleMismatches).toEqual([]);
  });

  it('should not keep legacy eaigofer prefixes in active docs', () => {
    const legacyReferences = LEGACY_DOC_PREFIX_PATHS.flatMap((relativePath) =>
      getLegacyDocReferences(relativePath).map((reference) => `${relativePath}: ${reference}`)
    );

    expect(legacyReferences).toEqual([]);
  });

  it('should not expose removed or no-op public settings', () => {
    const properties = packageJson.contributes.configuration.properties;

    expect(properties['gofer.autonomous.notificationChannel']).toBeUndefined();
    expect(properties['gofer.autonomous.emailAddress']).toBeUndefined();
    expect(properties['gofer.claudeTerminalName']).toBeUndefined();
    expect(properties['gofer.autoValidate']).toBeUndefined();
    expect(properties['gofer.showWelcome']).toBeUndefined();
    for (const setting of REMOVED_DIRECT_PROVIDER_SETTINGS) {
      expect(properties[setting]).toBeUndefined();
    }
  });

  it('should not expose removed Claude Code launcher or legacy council commands', () => {
    const declaredCommands = packageJson.contributes.commands.map((cmd) => cmd.command);
    const menuCommands = Object.values(packageJson.contributes.menus)
      .flat()
      .map((menu) => menu.command);

    for (const command of REMOVED_CLAUDE_LAUNCHER_COMMANDS) {
      expect(declaredCommands).not.toContain(command);
      expect(menuCommands).not.toContain(command);
      expect(allCommandSources).not.toContain(command);
    }
  });

  it('should reference the bundled hydrate prompt filename', () => {
    expect(specCommandsSource).toContain('gofer_hydrate.md');
    expect(specCommandsSource).not.toContain('gofer.hydrate.md');
  });

  it('should surface unexpected spec picker load failures through the shared logger and UI', () => {
    expect(specCommandsSource).toContain("Logger.for('SpecCommands')");
    expect(specCommandsSource).toContain("logger.error('Failed to load specs for picker'");
    expect(specCommandsSource).toContain('showErrorMessage(`Failed to load specs:');
    expect(specCommandsSource).not.toContain('console.error(');
  });

  it('should keep welcome view guidance aligned to the active workflow', () => {
    const progressWelcome = packageJson.contributes.viewsWelcome?.find(
      (entry) => entry.view === 'goferProgress'
    );

    expect(progressWelcome?.contents).toContain('[Start Gofer](command:gofer.run)');
    expect(progressWelcome?.contents).toContain('/eai');
    expect(progressWelcome?.contents).not.toContain('/gofer');
    expect(progressWelcome?.contents).not.toContain('#gofer');
    expect(progressWelcome?.contents).not.toContain('$gofer');
    expect(progressWelcome?.contents).not.toContain('/0_gofer_start');
    expect(progressWelcome?.contents).toContain(
      'research → specify → plan → tasks → implement → validate'
    );
    expect(progressWelcome?.contents).toContain('No `.specify` workspace was found yet.');
    expect(progressWelcome?.contents).toContain('terminal quality gate');
    expect(progressWelcome?.contents).toContain('Gofer: Install Optional Developer Tools');
    expect(progressWelcome?.contents).not.toContain('WhatsApp');
    expect(progressWelcome?.contents).not.toContain('gofer.showWelcome');
    expect(progressWelcome?.contents).not.toContain('gofer.autoValidate');
  });

  it('should not reference deleted legacy guides from active docs', () => {
    const activeDocPaths = [
      ...COMMAND_DOC_PATHS,
      ...COMMAND_ID_DOC_PATHS,
      ...COMMAND_PALETTE_DOC_PATHS,
      ...SETTINGS_DOC_PATHS,
    ];

    const deletedDocReferences = Array.from(
      new Set(
        activeDocPaths.flatMap((relativePath) =>
          DELETED_LEGACY_DOC_PATHS.filter((deletedDocPath) =>
            readWorkspaceFile(relativePath).includes(deletedDocPath)
          ).map((deletedDocPath) => `${relativePath}: ${deletedDocPath}`)
        )
      )
    );

    expect(deletedDocReferences).toEqual([]);
  });

  it('should record removed settings and deleted guides in release notes', () => {
    const rootChangelog = readWorkspaceFile('../../CHANGELOG.md');
    const extensionChangelog = readWorkspaceFile('../../extension/CHANGELOG.md');
    const combinedChangelog = `${rootChangelog}\n${extensionChangelog}`;

    expect(combinedChangelog).toContain('gofer.claudeTerminalName');
    expect(combinedChangelog).toContain('gofer.autoValidate');
    expect(combinedChangelog).toContain('gofer.showWelcome');
    expect(combinedChangelog).toContain('outdated setup guides');
    expect(combinedChangelog).toContain('manifest-backed command and settings surface');
  });

  it('should register all declared commands in extension.ts or command files', () => {
    const declaredCommands = packageJson.contributes.commands.map((cmd) => cmd.command);
    const missingCommands: string[] = [];

    for (const command of declaredCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    if (missingCommands.length > 0) {
      throw new Error(
        `The following commands are declared in package.json but not registered:\n${missingCommands.join('\n')}`
      );
    }
  });

  it('should have all critical navigation commands registered', () => {
    const criticalCommands = [
      'gofer.refreshSpecs',
      'gofer.refreshConstitution',
      'gofer.refreshMemory',
      'gofer.showProgress',
      'gofer.showConstitution',
      'gofer.initialize',
    ];

    const missingCommands: string[] = [];

    for (const command of criticalCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      // Check extension.ts (global commands) AND CommandRegistry.ts (workspace commands)
      if (
        !registrationPattern.test(extensionSource) &&
        !registrationPattern.test(commandRegistrySource)
      ) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should expose core VS Code management commands in the Command Palette', () => {
    const commandPalette = packageJson.contributes.menus.commandPalette ?? [];
    const menuByCommand = new Map(commandPalette.map((entry) => [entry.command, entry]));
    const expectedVisibleCommands = [
      'gofer.initialize',
      'gofer.installOptionalTools',
      'gofer.upgrade',
      'gofer.showProgress',
      'gofer.checkForUpdates',
      'gofer.updateNow',
    ];

    for (const command of expectedVisibleCommands) {
      expect(menuByCommand.get(command), `${command} should be contributed`).toBeDefined();
      expect(menuByCommand.get(command)?.when, `${command} should be visible`).not.toBe('false');
    }

    expect(menuByCommand.get('gofer.refreshSpecs')?.when).toBe('false');
  });

  it('should register all tree view commands', () => {
    const treeViewCommands = [
      'gofer.showSpecDetails',
      'gofer.showTaskDetails',
      'gofer.showSectionDetails',
      'gofer.showArticleDetails',
      'gofer.showMemoryDocument',
      'gofer.showMemorySection',
    ];

    const missingCommands: string[] = [];

    for (const command of treeViewCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      // Tree view commands may be in extension.ts or CommandRegistry.ts
      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should register all autonomous execution commands', () => {
    const autonomousCommands = [
      'gofer.startAutonomous',
      'gofer.stopAutonomous',
      'gofer.pauseAutonomous',
      'gofer.resumeAutonomous',
    ];

    const missingCommands: string[] = [];

    for (const command of autonomousCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should register all memory commands', () => {
    const memoryCommands = ['gofer.refreshMemory', 'gofer.showMemoryDocument'];

    const missingCommands: string[] = [];

    for (const command of memoryCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should register registerGlobalCommands() function', () => {
    // Check that registerGlobalCommands function exists
    expect(extensionSource).toContain('function registerGlobalCommands(');

    // Check that it's called in activate()
    expect(extensionSource).toContain('registerGlobalCommands(context)');
  });

  it('should use CommandRegistry for workspace commands', () => {
    // After T020 refactoring, registerCommands() was replaced by CommandRegistry.registerAll()
    expect(commandRegistrySource).toContain('class CommandRegistry');
    expect(commandRegistrySource).toContain('registerAll(');

    // Extension.ts should reference CommandRegistry
    expect(extensionSource).toContain('CommandRegistry');
  });

  it('should have commands distributed across extension.ts and CommandRegistry', () => {
    const globalCommandsSection = extensionSource.match(
      /function registerGlobalCommands\([^)]*\)[^{]*\{([\s\S]*?)^}/m
    );

    expect(globalCommandsSection).toBeTruthy();

    // Extract command registrations from global commands
    const globalCommands = globalCommandsSection
      ? globalCommandsSection[1].match(/registerCommand\s*\(\s*['"]([^'"]+)['"]/g) || []
      : [];

    // Extract command registrations from CommandRegistry
    const workspaceCommands =
      commandRegistrySource.match(/registerCommand\s*\(\s*['"]([^'"]+)['"]/g) || [];

    const totalRegistrations = globalCommands.length + workspaceCommands.length;

    // Should have at least 20 command registrations total across both files
    expect(totalRegistrations).toBeGreaterThan(20);
  });

  it('should activate on onStartupFinished event', () => {
    expect(packageJson.activationEvents).toContain('onStartupFinished');
  });

  it('should have main entry point as dist/extension.js', () => {
    expect(packageJson.main).toBe('./dist/extension.js');
  });

  it('should export activate() function', () => {
    expect(extensionSource).toMatch(/export\s+async\s+function\s+activate\s*\(/);
  });

  it('should export deactivate() function', () => {
    expect(extensionSource).toMatch(/export\s+async\s+function\s+deactivate\s*\(/);
  });

  it('should have tree views registered before commands', () => {
    // registerTreeViews should be called before registerGlobalCommands
    const registerTreeViewsCall = extensionSource.indexOf('registerTreeViews(context)');
    const registerGlobalCommandsCall = extensionSource.indexOf('registerGlobalCommands(context)');

    expect(registerTreeViewsCall).toBeGreaterThan(-1);
    expect(registerGlobalCommandsCall).toBeGreaterThan(-1);
    expect(registerTreeViewsCall).toBeLessThan(registerGlobalCommandsCall);
  });

  it('should have all view containers declared in package.json', () => {
    expect(packageJson.contributes.viewsContainers).toBeDefined();
    expect(packageJson.contributes.viewsContainers.activitybar).toBeDefined();
    expect(packageJson.contributes.viewsContainers.activitybar.length).toBeGreaterThan(0);
  });

  it('should have all views declared in package.json', () => {
    expect(packageJson.contributes.views).toBeDefined();
    expect(packageJson.contributes.views['gofer']).toBeDefined();

    const views = packageJson.contributes.views['gofer'];
    expect(views).toContainEqual(
      expect.objectContaining({
        id: 'goferProgress',
      })
    );
    expect(views).toContainEqual(
      expect.objectContaining({
        id: 'goferAIUsage',
      })
    );
    expect(views).toContainEqual(
      expect.objectContaining({
        id: 'goferMemory',
      })
    );
  });

  it('should register tree data providers for all views', () => {
    expect(extensionSource).toContain("registerTreeDataProvider('goferProgress'");
    expect(extensionSource).toContain("createTreeView('goferAIUsage'");
    expect(extensionSource).toContain("registerTreeDataProvider('goferMemory'");
  });

  it('should have update commands registered', () => {
    const updateCommands = ['gofer.checkForUpdates', 'gofer.updateNow'];

    const missingCommands: string[] = [];

    for (const command of updateCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      // Update commands may be in extension.ts or CommandRegistry.ts
      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should have spec creation and management commands registered', () => {
    const specCommands = ['gofer.createSpec', 'gofer.openSpec'];

    const missingCommands: string[] = [];

    for (const command of specCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      // Spec commands are in CommandRegistry.ts after T020 refactoring
      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });

  it('should have Open With commands registered', () => {
    const openWithCommands = [
      'gofer.openWithPreview',
      'gofer.openWithMarkSharp',
      'gofer.openWithMarkdownEditor',
      'gofer.openWithMarkdownWYSIWYG',
    ];

    const missingCommands: string[] = [];

    for (const command of openWithCommands) {
      const registrationPattern = new RegExp(
        `vscode\\.commands\\.registerCommand\\s*\\(\\s*['"]${command.replace('.', '\\.')}['"]`,
        'm'
      );

      // Open With commands may be in extension.ts or CommandRegistry.ts
      if (!registrationPattern.test(allCommandSources)) {
        missingCommands.push(command);
      }
    }

    expect(missingCommands).toEqual([]);
  });
});

describe('Package.json Validation', () => {
  let packageJson: PackageJson;

  beforeAll(() => {
    const packagePath = path.join(__dirname, '../../extension/package.json');
    packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as PackageJson;
  });

  it('should have required metadata', () => {
    // Keep the VS Code extension ID stable as EnterpriseAI.gofer so installed users upgrade cleanly.
    expect(packageJson.name).toBe('gofer');
    expect(packageJson.displayName).toBeDefined();
    expect(packageJson.description).toBeDefined();
    expect(packageJson.version).toBeDefined();
    expect(packageJson.publisher).toBeDefined();
  });

  it('should have engines.vscode defined', () => {
    expect(packageJson.engines).toBeDefined();
    expect(packageJson.engines.vscode).toBeDefined();
  });

  it('should have categories defined', () => {
    expect(packageJson.categories).toBeDefined();
    expect(packageJson.categories.length).toBeGreaterThan(0);
  });

  it('should have icon defined', () => {
    expect(packageJson.icon).toBeDefined();
  });

  it('should have repository defined', () => {
    expect(packageJson.repository).toBeDefined();
    expect(packageJson.repository.url).toContain('github.com');
  });

  it('should have all command titles and icons', () => {
    for (const command of packageJson.contributes.commands) {
      expect(command.command).toBeDefined();
      expect(command.title).toBeDefined();
      // Not all commands need icons, but if they have one, it should be valid
      if (command.icon) {
        expect(command.icon).toMatch(/^\$\([a-z-]+\)$/);
      }
    }
  });

  it('should have view/title menus for all views', () => {
    const viewTitleMenus = packageJson.contributes.menus['view/title'];
    expect(viewTitleMenus).toBeDefined();

    // Should have refresh commands in view/title for each view
    const progressRefresh = viewTitleMenus.find(
      (menu) => menu.command === 'gofer.refreshSpecs' && menu.when === 'view == goferProgress'
    );
    expect(progressRefresh).toBeDefined();

    const aiUsageRefresh = viewTitleMenus.find(
      (menu) => menu.command === 'gofer.refreshAIUsage' && menu.when === 'view == goferAIUsage'
    );
    expect(aiUsageRefresh).toBeDefined();

    const memoryRefresh = viewTitleMenus.find(
      (menu) => menu.command === 'gofer.refreshMemory' && menu.when === 'view == goferMemory'
    );
    expect(memoryRefresh).toBeDefined();
  });

  it('should have keybindings for important commands', () => {
    const keybindings = packageJson.contributes.keybindings;
    expect(keybindings).toBeDefined();

    // Check for important keybindings
    const initializeKeybinding = keybindings.find((kb) => kb.command === 'gofer.initialize');
    expect(initializeKeybinding).toBeDefined();

    const refreshKeybinding = keybindings.find((kb) => kb.command === 'gofer.refreshSpecs');
    expect(refreshKeybinding).toBeDefined();
  });

  it('should not depend on direct provider SDKs after CLI-provider cleanup', () => {
    const unexpectedDependencies = PACKAGE_JSON_PATHS.flatMap((relativePath) => {
      const manifest = JSON.parse(readWorkspaceFile(relativePath)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      };

      return REMOVED_DIRECT_PROVIDER_SDKS.filter((dependency) =>
        Object.prototype.hasOwnProperty.call(dependencies, dependency)
      ).map((dependency) => `${relativePath}: ${dependency}`);
    });

    expect(unexpectedDependencies).toEqual([]);
  });
});
