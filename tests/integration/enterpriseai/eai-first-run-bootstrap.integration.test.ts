import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('enterpriseai first-run bootstrap command', () => {
  it('defines a plugin-level first-run command before workspace preflight is required', () => {
    const command = readRepoFile('.specify/commands/gofer_eai_first_run.md');

    expect(command).toContain('name: gofer:eai-first-run');
    expect(command).toContain('allowed to run before `.specify/` exists');
    expect(command).toContain('GitHub Codespaces');
    expect(command).toContain('Windows');
    expect(command).toContain('PowerShell');
    expect(command).toContain('winget');
    expect(command).toContain('apt');
    expect(command).toContain('dnf');
    expect(command).toContain('zypper');
    expect(command).toContain('git --version');
    expect(command).toContain('node --version');
    expect(command).toContain('npm --version');
    expect(command).toContain('npm config get @enterpriseai:registry');
    expect(command).toContain('npm install -g eai-cli');
    expect(command).toContain(
      'npm install -g @enterpriseai/cli --@enterpriseai:registry=https://eai-support.github.io/eai/registry/'
    );
    expect(command).toContain('eai update --check');
    expect(command).toContain('eai --describe');
    expect(command).toContain('eai agent guide --format json');
    expect(command).toContain('eai errors explain <code-or-reason> --format json');
    expect(command).toContain('eai whoami');
    expect(command).toContain('eai tenant list --format json');
    expect(command).toContain('eai provision entra');
    expect(command).toContain('AADSTS50011');
    expect(command).toContain(
      'eai provision entra --force --redirect-uri <confirmed-callback-uri>'
    );
    expect(command).toContain('Record only the redacted route pattern');
    expect(command).toContain('Use `--debug` only when the user explicitly approves it');
    expect(command).toContain(
      'eai init <project-name> --skip-prompts --company-tenant <active-tenant-id>'
    );
    expect(command).toContain('eai template check --format json');
    expect(command).toContain('eai gofer refresh --check --format json');
    expect(command).toContain('eai doctor --check-updates');
    expect(command).toContain('E001');
    expect(command).toContain('.specify/logs/eai-first-run-report.md');
    expect(command).toContain('/gofer <what you want to build>');
    expect(command).toContain('/eai');
    expect(command).not.toContain('/0_gofer_start <what you want to build>');
  });

  it('keeps first-run as an internal contract while exposing public wrappers', () => {
    const hiddenHelperFiles = [
      '.claude/commands/gofer_eai_first_run.md',
      'extension/resources/claude-commands/gofer_eai_first_run.md',
      '.github/prompts/gofer_eai_first_run.prompt.md',
      'extension/resources/copilot-prompts/gofer_eai_first_run.prompt.md',
      '.agents/skills/gofer_eai_first_run/SKILL.md',
      '.system/skills/gofer_eai_first_run/SKILL.md',
      '.gemini/commands/gofer/gofer_eai_first_run.toml',
      'extension/resources/gemini/commands/gofer/gofer_eai_first_run.toml',
    ];

    for (const relativePath of hiddenHelperFiles) {
      expect(fs.existsSync(path.join(process.cwd(), relativePath)), relativePath).toBe(false);
    }

    expect(
      fs.existsSync(path.join(process.cwd(), '.specify/commands/gofer_eai_first_run.md'))
    ).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), '.claude/commands/gofer.md'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), '.agents/skills/gofer/SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), '.claude/commands/eai.md'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), '.agents/skills/eai/SKILL.md'))).toBe(true);
  });

  it('does not inject normal workspace preflight into the first-run contract', () => {
    const firstRunContract = readRepoFile('.specify/commands/gofer_eai_first_run.md');

    expect(firstRunContract).toContain('EAI Gofer First Run');
    expect(firstRunContract).not.toContain('## Workspace Preflight');
    expect(firstRunContract).toContain(
      'This command is intentionally allowed to run before `.specify/` exists.'
    );
  });
});
