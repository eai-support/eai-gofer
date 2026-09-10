import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const reference = '.specify/references/platform/eai-auth-access.md';
const surfaces = [
  '.agents/skills/eai/SKILL.md',
  '.system/skills/eai/SKILL.md',
  '.claude/commands/eai.md',
  '.claude/skills/eai/SKILL.md',
  '.github/prompts/eai.prompt.md',
  '.github/skills/eai/SKILL.md',
  '.grok/skills/eai/SKILL.md',
  '.gemini/commands/gofer/eai.md',
  'skills/eai/SKILL.md',
  'plugins/eai-gofer/skills/eai/SKILL.md',
  'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'extension/resources/copilot-prompts/eai.prompt.md',
  'extension/resources/claude-skills/eai/SKILL.md',
];

describe('authentication access decision contract', () => {
  it.each(surfaces)('retains the safe default and separate SSO decision in %s', (file) => {
    const text = read(file);
    expect(text).toContain(reference);
    expect(text).toContain('only members of its EAI workspace (recommended)');
    expect(text).toContain('or any authenticated EAI user?');
    expect(text).toContain('An unanswered question must not widen access');
    expect(text).toContain('Preserve stricter existing rules');
    expect(text).toContain('Confirm the sign-in method separately');
    expect(text).toContain('do not invent SSO commands');
    expect(text).toContain('server-side workspace membership and app permissions');
    expect(text).toContain("Platform-wide sign-in never grants access to another workspace's data");
    expect(text).toContain('not to non-app work or an auth-free local MVP');
    expect(text.match(/\*\*Authentication Access Decision\*\*/g)).toHaveLength(1);
  });

  it.each([
    '0_gofer_start',
    '1_gofer_research',
    '2_gofer_specify',
    '3_gofer_plan',
    '4_gofer_tasks',
    '5_gofer_implement',
    '6_gofer_validate',
    'gofer_eai_first_run',
  ])('keeps the decision in the internal %s contract', (stage) => {
    const text = read(`.specify/commands/${stage}.md`);
    expect(text).toContain(reference);
    expect(text).toContain('Wait for the answer before changing auth code');
    expect(text).toContain('revoked membership, unavailable membership checks');
    expect(text).toContain('only when authentication is implemented or required');
    expect(text.match(/\*\*Authentication Access Decision\*\*/g)).toHaveLength(1);
  });

  it('ships the complete reference and decision fields in extension and plugin packages', () => {
    expect(read('.gemini/commands/gofer/eai.toml')).toContain('{{include: ./eai.md}}');
    const contract = read(reference);
    expect(read('extension/resources/references/platform/eai-auth-access.md')).toBe(contract);
    expect(read(`plugins/eai-gofer/${reference}`)).toBe(contract);
    for (const file of [
      '.specify/templates/spec-template.md',
      'extension/resources/templates/spec-template.md',
      'plugins/eai-gofer/.specify/templates/spec-template.md',
    ]) {
      expect(read(file)).toContain('Owner confirmation and rationale');
      expect(read(file)).toContain('workspace-only (default)');
      expect(read(file)).toContain('Sign-in method');
    }
  });

  it('requires authorization evidence without claiming source tests prove live SSO', () => {
    const contract = read(reference);
    expect(contract).toContain(
      'An authenticated non-member cannot access protected workspace content'
    );
    expect(contract).toContain('A forged workspace selection');
    expect(contract).toContain('A revoked member loses access');
    expect(contract).toContain('An unavailable membership service does not grant access');
    expect(contract).toContain('Changing the sign-in provider does not widen');
    expect(contract).toMatch(/Never\s+link identities by email alone/);
    expect(contract.replace(/\s+/g, ' ')).toContain('passing source tests do not prove');
    expect(read('.specify/references/mvp-capability-validation.md')).toContain(reference);
  });

  it('does not add an app access gate to maintenance commands', () => {
    for (const file of [
      '.agents/skills/eai-update/SKILL.md',
      'plugins/eai-gofer/plugin-skills/eai-update/SKILL.md',
    ]) {
      expect(read(file)).not.toContain('Authentication Access Decision');
    }
  });
});
