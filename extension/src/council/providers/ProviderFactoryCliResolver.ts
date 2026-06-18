import * as vscode from 'vscode';
import { type WorkflowProfile } from '../../config/workflowProfile';
import { type LLMProvider } from './LLMProvider';
import { type CLIHealthResult } from './cli/CLIHealthChecker';

export type CLIType = 'claude' | 'codex';
type CLIPreference = CLIType | 'copilot' | 'gemini' | 'auto';

interface CLIResolverLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
}

interface CLIResolverDependencies {
  logger: CLIResolverLogger;
  createCLIProvider: (
    cliType: CLIType,
    command?: string,
    workflowProfile?: WorkflowProfile
  ) => Promise<LLMProvider>;
  resolveWorkflowProfileContext: (
    explicitProfile?: WorkflowProfile,
    configuration?: vscode.WorkspaceConfiguration
  ) => WorkflowProfile;
}

function isHealthyCLI(result: CLIHealthResult): boolean {
  return result.available && result.authenticated && result.compatible;
}

export function getCLIProviderDisplayName(cliType: CLIType): string {
  return cliType === 'claude' ? 'Claude Code' : 'Codex';
}

function buildPreferredCLIUnavailableMessage(
  preferred: CLIType,
  workflowProfile: WorkflowProfile,
  preferredHealth: CLIHealthResult,
  fallback: {
    cliType: CLIType;
    healthy: boolean;
    installInstructions?: string;
    authInstructions?: string;
  }
): string {
  const preferredName = getCLIProviderDisplayName(preferred);
  const fallbackName = getCLIProviderDisplayName(fallback.cliType);

  const details: string[] = [
    `Preferred ${preferredName} CLI is unavailable.`,
    `Active workflow profile: ${workflowProfile}.`,
  ];

  if (!preferredHealth.available) {
    details.push(preferredHealth.installInstructions || `${preferredName} CLI is not installed.`);
  } else if (!preferredHealth.authenticated) {
    details.push(preferredHealth.authInstructions || `${preferredName} CLI is not authenticated.`);
  } else if (!preferredHealth.compatible) {
    details.push(preferredHealth.errorMessage || `${preferredName} CLI version is incompatible.`);
  }

  if (fallback.healthy) {
    details.push(
      `Fallback available: ${fallbackName} CLI. Set gofer.cliProvider to "${fallback.cliType}" or "auto".`
    );
  } else {
    details.push(
      'No compatible fallback CLI was detected. Install or authenticate either CLI and retry.'
    );
    if (fallback.installInstructions) {
      details.push(`Fallback install: ${fallback.installInstructions}`);
    } else if (fallback.authInstructions) {
      details.push(`Fallback auth: ${fallback.authInstructions}`);
    }
  }

  return details.join('\n');
}

export class ProviderFactoryCliResolver {
  constructor(private readonly dependencies: CLIResolverDependencies) {}

  public async autoDetectCLI(workflowProfile?: WorkflowProfile): Promise<CLIType | null> {
    const { CLIHealthChecker } = await import('./cli/CLIHealthChecker');
    const config = vscode.workspace.getConfiguration('gofer');
    const profileContext = this.dependencies.resolveWorkflowProfileContext(workflowProfile, config);

    const defaultCLI = config.get<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'>(
      'defaultCLI',
      'auto'
    );

    if (defaultCLI !== 'auto') {
      if (defaultCLI === 'copilot' || defaultCLI === 'gemini') {
        this.dependencies.logger.info(
          `gofer.defaultCLI is set to ${defaultCLI}; evaluating CLI-capable fallbacks for autonomous mode`,
          {
            workflowProfile: profileContext,
          }
        );

        const claudeCommand = config.get<string>('claudeCodeCommand', 'claude');
        const claudeResult = await CLIHealthChecker.check('claude', claudeCommand);
        if (isHealthyCLI(claudeResult)) {
          this.dependencies.logger.info('Auto-detected Claude Code CLI');
          return 'claude';
        }

        const codexCommand = config.get<string>('codexCommand', 'codex');
        const codexResult = await CLIHealthChecker.check('codex', codexCommand);
        if (isHealthyCLI(codexResult)) {
          this.dependencies.logger.info('Auto-detected Codex CLI');
          return 'codex';
        }

        return null;
      }

      if (defaultCLI === 'claude') {
        const claudeCommand = config.get<string>('claudeCodeCommand', 'claude');
        const claudeResult = await CLIHealthChecker.check('claude', claudeCommand);
        if (isHealthyCLI(claudeResult)) {
          this.dependencies.logger.info('Using Claude Code CLI (user preference)');
          return 'claude';
        }

        this.dependencies.logger.warn(
          'Preferred Claude Code CLI is unavailable, falling back to auto-detection',
          {
            installInstructions: claudeResult.installInstructions,
            authInstructions: claudeResult.authInstructions,
            errorMessage: claudeResult.errorMessage,
            workflowProfile: profileContext,
          }
        );
      } else if (defaultCLI === 'codex') {
        const codexCommand = config.get<string>('codexCommand', 'codex');
        const codexResult = await CLIHealthChecker.check('codex', codexCommand);
        if (isHealthyCLI(codexResult)) {
          this.dependencies.logger.info('Using Codex CLI (user preference)');
          return 'codex';
        }

        this.dependencies.logger.warn(
          'Preferred Codex CLI is unavailable, falling back to auto-detection',
          {
            installInstructions: codexResult.installInstructions,
            authInstructions: codexResult.authInstructions,
            errorMessage: codexResult.errorMessage,
            workflowProfile: profileContext,
          }
        );
      }
    }

    const claudeCommand = config.get<string>('claudeCodeCommand', 'claude');
    const claudeResult = await CLIHealthChecker.check('claude', claudeCommand);
    if (isHealthyCLI(claudeResult)) {
      this.dependencies.logger.info('Auto-detected Claude Code CLI');
      return 'claude';
    }

    const codexCommand = config.get<string>('codexCommand', 'codex');
    const codexResult = await CLIHealthChecker.check('codex', codexCommand);
    if (isHealthyCLI(codexResult)) {
      this.dependencies.logger.info('Auto-detected Codex CLI');
      return 'codex';
    }

    this.dependencies.logger.warn('No CLI provider detected during auto-detection', {
      workflowProfile: profileContext,
    });
    return null;
  }

  public async getCLIProvider(workflowProfile?: WorkflowProfile): Promise<LLMProvider> {
    const { CLIHealthChecker } = await import('./cli/CLIHealthChecker');
    const config = vscode.workspace.getConfiguration('gofer');
    const preference = config.get<CLIPreference>('cliProvider', 'auto');
    const profileContext = this.dependencies.resolveWorkflowProfileContext(workflowProfile, config);

    if (preference === 'copilot' || preference === 'gemini') {
      this.dependencies.logger.info(
        `gofer.cliProvider is set to ${preference}; autonomous mode will use CLI-capable auto-detection (Claude/Codex)`,
        {
          workflowProfile: profileContext,
        }
      );
    } else if (preference !== 'auto') {
      try {
        const provider = await this.dependencies.createCLIProvider(
          preference,
          undefined,
          profileContext
        );
        this.dependencies.logger.info(
          `Using ${getCLIProviderDisplayName(preference)} CLI (user preference)`
        );
        return provider;
      } catch (error: unknown) {
        const preferredCommand = config.get<string>(
          preference === 'claude' ? 'claudeCodeCommand' : 'codexCommand',
          preference
        );
        const preferredHealth = await CLIHealthChecker.check(preference, preferredCommand);

        const fallbackType: CLIType = preference === 'claude' ? 'codex' : 'claude';
        const fallbackCommand = config.get<string>(
          fallbackType === 'claude' ? 'claudeCodeCommand' : 'codexCommand',
          fallbackType
        );
        const fallbackHealth = await CLIHealthChecker.check(fallbackType, fallbackCommand);
        const fallbackHealthy = isHealthyCLI(fallbackHealth);

        const guidance = buildPreferredCLIUnavailableMessage(
          preference,
          profileContext,
          preferredHealth,
          {
            cliType: fallbackType,
            healthy: fallbackHealthy,
            installInstructions: fallbackHealth.installInstructions,
            authInstructions: fallbackHealth.authInstructions,
          }
        );

        this.dependencies.logger.warn(
          `Preferred ${getCLIProviderDisplayName(preference)} CLI unavailable`,
          {
            error: error instanceof Error ? error.message : String(error),
            preferredCommand,
            preferredHealth,
            fallbackType,
            fallbackHealthy,
            workflowProfile: profileContext,
          }
        );

        throw new Error(guidance, {
          cause: error,
        });
      }
    }

    const detected = await this.autoDetectCLI(profileContext);
    if (!detected) {
      const claudeCommand = config.get<string>('claudeCodeCommand', 'claude');
      const codexCommand = config.get<string>('codexCommand', 'codex');
      const claudeResult = await CLIHealthChecker.check('claude', claudeCommand);
      const codexResult = await CLIHealthChecker.check('codex', codexCommand);

      let errorMsg = 'No CLI provider available for autonomous mode.\n\n';
      if (!claudeResult.available) {
        errorMsg += `Claude CLI: ${claudeResult.installInstructions}\n`;
      } else if (!claudeResult.authenticated) {
        errorMsg += `Claude CLI: ${claudeResult.authInstructions}\n`;
      } else if (!claudeResult.compatible) {
        errorMsg += `Claude CLI: ${claudeResult.errorMessage}\n`;
      }

      if (!codexResult.available) {
        errorMsg += `Codex CLI: ${codexResult.installInstructions}\n`;
      } else if (!codexResult.authenticated) {
        errorMsg += `Codex CLI: ${codexResult.authInstructions}\n`;
      } else if (!codexResult.compatible) {
        errorMsg += `Codex CLI: ${codexResult.errorMessage}\n`;
      }

      this.dependencies.logger.warn('No CLI provider available for autonomous mode', {
        claudeResult,
        codexResult,
        workflowProfile: profileContext,
      });
      throw new Error(errorMsg);
    }

    this.dependencies.logger.info(`Auto-detected ${getCLIProviderDisplayName(detected)} CLI`);
    return this.dependencies.createCLIProvider(detected, undefined, profileContext);
  }
}
