import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('MVP capability-based validation', () => {
  it('keeps early local MVP work separate from later platform requirements', () => {
    const contract = read('.specify/references/mvp-capability-validation.md');
    const start = read('.specify/commands/0_gofer_start.md');
    const tasks = read('.specify/commands/4_gofer_tasks.md');

    expect(contract).toContain('not_applicable');
    expect(contract).toContain('planned');
    expect(contract).toContain('implemented');
    expect(contract).toContain('verified');
    expect(contract).toContain('blocked');
    expect(contract).toMatch(/Do not\s+apply later delivery requirements to an early MVP/);
    expect(start).toContain('early local MVP');
    expect(start).toContain('does not block unrelated local MVP');
    expect(tasks).toContain('Local MVP UI and implementation tasks can continue');
  });

  it('requires the full authentication journey only when authentication is in scope', () => {
    const contract = read('.specify/references/mvp-capability-validation.md');
    const skill = read('skills/eai/SKILL.md');

    expect(contract).toContain('Provider endpoint responds as expected');
    expect(contract).toContain('The first protected API call succeeds');
    expect(contract).toContain('An unauthorised user fails safely');
    expect(skill).toContain('When authentication is implemented or required');
    expect(skill).toContain('For a local MVP with no EAI or authentication capability');
  });

  it('updates delivery artifacts before scope changes continue', () => {
    const contract = read('.specify/references/mvp-capability-validation.md');
    const skill = read('skills/eai/SKILL.md');

    expect(contract).toContain('Update `spec.md`, `plan.md`, `tasks.md`, `traceability.md`');
    expect(contract).toContain('Tell the user what changed');
    expect(skill).toContain(
      'If the user changes scope, update the feature artifacts before continuing'
    );
  });

  it('blocks release completion when an accepted capability is not released', () => {
    const contract = read('.specify/references/mvp-capability-validation.md');
    const template = read('.specify/templates/release-capability-ledger-template.md');
    const skill = read('skills/eai/SKILL.md');

    expect(contract).toContain('Release Capability Ledger');
    expect(contract).toMatch(/remains on\s+an open PR/);
    expect(contract).toMatch(/absent from the release branch/);
    expect(template).toContain('Responsible PR and commit');
    expect(template).toContain('Deployed evidence');
    expect(skill).toContain('release-capability-ledger.md');
    expect(skill).toContain('score 100%');
  });

  it('ships the same rule on every generated public surface', () => {
    for (const relativePath of [
      '.agents/skills/eai/SKILL.md',
      '.system/skills/eai/SKILL.md',
      '.claude/skills/eai/SKILL.md',
      '.github/skills/eai/SKILL.md',
      '.grok/skills/eai/SKILL.md',
      'plugins/eai-gofer/skills/eai/SKILL.md',
      'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
    ]) {
      const content = read(relativePath);
      expect(content, relativePath).toContain('MVP Capability-Based Validation');
      expect(content, relativePath).toContain('release-capability-ledger.md');
      expect(content, relativePath).toContain('local MVP');
    }
  });
});
