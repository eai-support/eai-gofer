import * as path from 'path';
import * as vscode from 'vscode';
import { FileUtils } from '../utils/fileUtils';
import { ProjectInfo } from './ProjectDetector';

/**
 * Assembles composable template fragments into instruction files
 * (AGENTS.md, CLAUDE.md, copilot-instructions.md) using detected project info.
 *
 * All generation is deterministic — no API keys or network access required.
 */
export class InstructionGenerator {
  private templatesPath: string;

  constructor(templatesPath?: string) {
    if (templatesPath) {
      this.templatesPath = templatesPath;
    } else {
      const ext = vscode.extensions.getExtension('EnterpriseAI.gofer');
      const extPath = ext?.extensionPath || path.resolve(__dirname, '..');
      this.templatesPath = path.join(extPath, 'resources', 'instruction-templates');
    }
  }

  /**
   * T022/T024/T026: Generate AGENTS.md content from project info.
   */
  public async generateAgentsMd(projectInfo: ProjectInfo): Promise<string> {
    const base = await this.loadTemplate('base', 'agents-base.md');
    const langFragment = await this.loadLanguageFragment(projectInfo.language);
    const principlesFragment = await this.loadTemplate('workflow', 'principles.md');

    let content = base;

    // Project overview substitutions
    content = content.replace('{{projectName}}', projectInfo.name);
    content = content.replace('{{language}}', this.formatLanguage(projectInfo.language));
    content = content.replace(
      '{{frameworkLine}}',
      projectInfo.framework ? `\n- **Framework**: ${projectInfo.framework}` : ''
    );
    content = content.replace('{{packageManager}}', projectInfo.packageManager || 'Not detected');

    // Commands section
    content = content.replace('{{commands}}', this.buildCommandsSection(projectInfo));

    // Structure section
    content = content.replace('{{structure}}', this.buildStructureSection(projectInfo));

    // Code style section (language fragment)
    content = content.replace('{{codeStyle}}', langFragment.trim());

    // Testing section
    content = content.replace('{{testing}}', this.buildTestingSection(projectInfo));

    // Git workflow section
    content = content.replace('{{gitWorkflow}}', this.buildGitWorkflowSection());

    // Boundaries section
    content = content.replace('{{boundaries}}', this.buildBoundariesSection());

    // Core principles (from workflow/principles.md)
    content = content.replace('{{principles}}', principlesFragment.trim());

    if (projectInfo.eaiInitialized) {
      content = content.replace(
        '## Core Principles',
        `${this.buildEaiRepoContractSection()}\n\n## Core Principles`
      );
    }

    return this.withAlwaysOnContract(content);
  }

  /**
   * T022/T025: Generate CLAUDE.md content from project info.
   */
  public async generateClaudeMd(projectInfo: ProjectInfo): Promise<string> {
    const base = await this.loadTemplate('base', 'claude-base.md');
    const workflowFragment = await this.loadTemplate('workflow', 'principles.md');
    const goferFragment = await this.loadTemplate('gofer', 'gofer-claude.md');

    let content = base;

    // Extract the Workflow Principles section (up to Task Management) for CLAUDE.md
    const lines = workflowFragment.split('\n');
    const startIdx = lines.findIndex((l) => l.startsWith('### Workflow Principles'));
    const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('### Task Management'));
    const workflowSection = lines
      .slice(startIdx >= 0 ? startIdx + 1 : 0, endIdx >= 0 ? endIdx : lines.length)
      .join('\n')
      .trim();
    content = content.replace('{{workflow}}', workflowSection);

    // Gofer pipeline commands
    content = content.replace('{{goferCommands}}', goferFragment.trim());

    if (projectInfo.eaiInitialized) {
      content = `${content.trimEnd()}\n\n${this.buildEaiRepoContractSection()}\n`;
    }

    // Keep the compact host file budget without dropping any instruction text.
    return (await this.withAlwaysOnContract(content))
      .replace(/\r\n/g, '\n')
      .trimEnd()
      .replace(/\n{2,}/g, '\n');
  }

  /**
   * T022/T026b: Generate copilot-instructions.md content from project info.
   */
  public async generateCopilotMd(projectInfo: ProjectInfo): Promise<string> {
    const base = await this.loadTemplate('base', 'copilot-base.md');
    const goferFragment = await this.loadTemplate('gofer', 'gofer-copilot.md');
    const langFragment = await this.loadLanguageFragment(projectInfo.language);

    let content = base;

    // Project overview
    content = content.replace('{{projectOverview}}', this.buildCopilotOverview(projectInfo));

    // Available commands (Gofer integration)
    content = content.replace('{{availableCommands}}', goferFragment.trim());

    // Code quality (language conventions)
    content = content.replace('{{codeQuality}}', langFragment.trim());

    if (projectInfo.eaiInitialized) {
      content = content.replace(
        '## Code Quality',
        `${this.buildEaiRepoContractSection()}\n\n## Code Quality`
      );
    }

    return this.withAlwaysOnContract(content);
  }

  // --- Private helpers ---

  private async withAlwaysOnContract(content: string): Promise<string> {
    const contract = await this.loadTemplate('workflow', 'always-on-eai.md');
    return `${content.trimEnd()}\n\n${contract.trim()}\n`;
  }

  private async loadTemplate(subdir: string, filename: string): Promise<string> {
    const filePath = path.join(this.templatesPath, subdir, filename);
    return FileUtils.readTextFile(filePath);
  }

  private async loadLanguageFragment(language: string): Promise<string> {
    const langMap: Record<string, string> = {
      typescript: 'typescript.md',
      javascript: 'typescript.md', // JS projects use same conventions
      python: 'python.md',
      go: 'go.md',
      rust: 'rust.md',
      java: 'java.md',
    };
    const filename = langMap[language] || 'generic.md';
    return this.loadTemplate('languages', filename);
  }

  private formatLanguage(language: string): string {
    const names: Record<string, string> = {
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      python: 'Python',
      go: 'Go',
      rust: 'Rust',
      java: 'Java',
      unknown: 'Unknown',
    };
    return names[language] || language;
  }

  private buildCommandsSection(info: ProjectInfo): string {
    const lines: string[] = [];
    if (info.buildCommand) {
      lines.push(`- **Build**: \`${info.buildCommand}\``);
    }
    if (info.testCommand) {
      lines.push(`- **Test**: \`${info.testCommand}\``);
    }
    if (info.lintCommand) {
      lines.push(`- **Lint**: \`${info.lintCommand}\``);
    }
    if (info.formatCommand) {
      lines.push(`- **Format**: \`${info.formatCommand}\``);
    }
    return lines.length > 0
      ? lines.join('\n')
      : 'No commands detected. Add build/test/lint scripts to your project.';
  }

  private buildStructureSection(info: ProjectInfo): string {
    if (info.language === 'typescript' || info.language === 'javascript') {
      return 'Standard Node.js project layout. Source in `src/`, tests alongside or in `tests/`.';
    }
    if (info.language === 'python') {
      return 'Standard Python project layout. Source in project package directory, tests in `tests/`.';
    }
    if (info.language === 'go') {
      return 'Standard Go project layout. Packages in `cmd/` and `internal/` or `pkg/`.';
    }
    if (info.language === 'rust') {
      return 'Standard Cargo project layout. Source in `src/`, tests inline or in `tests/`.';
    }
    if (info.language === 'java') {
      return 'Standard Maven/Gradle layout. Source in `src/main/java/`, tests in `src/test/java/`.';
    }
    return 'Follow existing project conventions for directory structure.';
  }

  private buildTestingSection(info: ProjectInfo): string {
    const lines: string[] = [];
    if (info.testRunner) {
      lines.push(`- **Test Runner**: ${info.testRunner}`);
    }
    if (info.testCommand) {
      lines.push(`- **Run Tests**: \`${info.testCommand}\``);
    }
    lines.push('- Write tests for new functionality before marking tasks complete');
    lines.push('- Run the full test suite before committing');
    return lines.join('\n');
  }

  private buildGitWorkflowSection(): string {
    return [
      '- Use conventional commit messages (feat:, fix:, chore:, docs:)',
      '- Create feature branches for new work',
      '- Run tests and linting before committing',
    ].join('\n');
  }

  private buildBoundariesSection(): string {
    return [
      '- Do not modify files outside the project scope without approval',
      '- Do not commit secrets, API keys, or credentials',
      '- Do not add dependencies without justification',
    ].join('\n');
  }

  private buildCopilotOverview(info: ProjectInfo): string {
    const parts: string[] = [];
    parts.push(`**${info.name}** is a ${this.formatLanguage(info.language)} project`);
    if (info.framework) {
      parts[0] += ` using ${info.framework}`;
    }
    parts[0] += '.';
    if (info.packageManager) {
      parts.push(`Package manager: ${info.packageManager}.`);
    }
    if (info.testRunner) {
      parts.push(`Test runner: ${info.testRunner}.`);
    }
    return parts.join(' ');
  }

  private buildEaiRepoContractSection(): string {
    return [
      '## EAI Repo Contract',
      '',
      '- This repo appears to be initialized from the EAI app template. Read `.specify/references/platform/eai-repo-contract.md` and `.specify/references/platform/eai-error-catalog.yaml` before app-delivery work.',
      '- Classify the request before EAI readiness. If it is EAI app delivery or ambiguous, continue directly to EAI readiness. If it is clearly non-app work, confirm once before skipping EAI tenant/app setup.',
      '- Run `eai whoami` only for EAI app delivery work or explicit EAI CLI recovery, not for confirmed non-app research/docs/audit/planning.',
      '- Use the public `eai` entrypoint when CLI, login, tenant, template, or Gofer readiness is missing or stale; then follow the internal first-run setup contract in `.specify/commands/gofer_eai_first_run.md` when present.',
      '- Check `eai update --check`, `eai --describe`, `eai agent guide --format json`, `eai template check --format json`, `eai gofer refresh --check --format json`, and `eai workflow readiness --format json` when the CLI advertises them.',
      '- After any `eai` command error, use `eai errors explain <code-or-reason> --format json` before guessing remediation.',
      '- If `eai errors explain` is unavailable, match `.specify/references/platform/eai-error-catalog.yaml`, run read-only diagnostics before mutating fixes, and stop at the retry or escalation condition.',
      '- For `eai user invite` 5xx or `EXTERNAL_SERVICE_ERROR`, check existing members with `eai user list --tenant <tenant-id> --search <email> --format json`; use `eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json` only after verification and user approval, then tell the app user to sign out and sign back in.',
      '- For `MISSING_TENANT`, `app_token_tenant_context_required`, or "Tenant context required for app tokens" on platform user lookup or membership prerequisites, run `eai errors explain app_token_tenant_context_required --format json`, confirm tenant context, and retry `/v4/platform/tenants/<tenant-id>/...` routes before changing tenant members, Entra, role definitions, databases, or cloud portals.',
      '- Build on EAI Platform first and Azure second. Keep provisioning, types seed, schema/storage health, workflow readiness, and preview as separate gates.',
    ].join('\n');
  }
}
