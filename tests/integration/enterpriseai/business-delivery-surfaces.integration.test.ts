import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
describe('business communication and goal review across packaged surfaces', () => {
  it.each([
    '.agents/skills/eai/SKILL.md',
    '.system/skills/eai/SKILL.md',
    '.claude/skills/eai/SKILL.md',
    '.claude/commands/eai.md',
    '.github/skills/eai/SKILL.md',
    '.github/prompts/eai.prompt.md',
    '.gemini/commands/gofer/eai.md',
    '.grok/skills/eai/SKILL.md',
    'skills/eai/SKILL.md',
    'plugin-skills/eai/SKILL.md',
    'plugins/eai-gofer/skills/eai/SKILL.md',
    'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
    'extension/resources/claude-skills/eai/SKILL.md',
    'extension/resources/github-skills/eai/SKILL.md',
    'extension/resources/gemini/commands/gofer/eai.md',
    'extension/resources/grok-skills/eai/SKILL.md',
    ...['plugins/eai-gofer', 'plugins/eai-gofer/plugins/eai-gofer'].flatMap((base) => [
      `${base}/commands/eai.md`,
      `${base}/.claude/skills/eai/SKILL.md`,
      `${base}/.gemini/commands/gofer/eai.md`,
      `${base}/.github/skills/eai/SKILL.md`,
      `${base}/.github/prompts/eai.prompt.md`,
      `${base}/.grok/skills/eai/SKILL.md`,
    ]),
    'extension/resources/copilot-prompts/eai.prompt.md',
    ...[
      '0_gofer_start',
      '1_gofer_research',
      '2_gofer_specify',
      '3_gofer_plan',
      '4_gofer_tasks',
      '5_gofer_implement',
      '6_gofer_validate',
    ].map((id) => `.specify/commands/${id}.md`),
  ])('carries the same checks without dropping existing rules in %s', (file) => {
    const text = read(file);
    expect(text).toContain('gofer-response-check.mjs');
    expect(text).toContain('--business-update option');
    expect(text).toContain(
      'probabilities show the closest alternative, not why Jev chose its answer'
    );
    expect(text).toContain('gofer-delivery-check.mjs');
    expect(text).toContain('gofer-priority-check.mjs');
    expect(text).toContain('Priority And Outcome Protection');
    expect(text).toContain('Pre-Edit Chat Readiness');
    expect(text).toContain('gofer-pre-edit-check.mjs');
    expect(text).toContain('Check whether this chat is set up for success with Jev.');
    expect(text).toContain('No Jev request occurs by default.');
    expect(text).toContain('Do not switch to unrelated work when blocked');
    expect(text).toContain('missing or stale outcome receipt means unverified');
    expect(text).toContain('requireDeliveryCheckpoint');
    expect(text).toContain('Never weaken acceptance criteria');
    expect(text).toContain('reopen affected tasks when evidence is stale');
    expect(text).toContain('Conversation-only requests need no feature files');
    expect(text).toContain('cannot intercept messages that the host sends directly');
    expect(text).toContain('Authentication Access Decision');
    expect(text).toContain('MVP Capability-Based Validation');
    expect(text.match(/\*\*Business Updates And Goal Checks\*\*/g)).toHaveLength(1);
  });

  it.each([
    '.github/agents/eai.agent.md',
    'extension/resources/github-agents/eai.agent.md',
    'plugins/eai-gofer/.github/agents/eai.agent.md',
    'plugins/eai-gofer/plugins/eai-gofer/.github/agents/eai.agent.md',
  ])('includes the business response contract in %s', (file) => {
    const text = read(file);
    expect(text).toContain('--business-update option');
    expect(text).toContain(
      'probabilities show the closest alternative, not why Jev chose its answer'
    );
  });

  it('keeps the blocker reference and packaged copies aligned', () => {
    const canonical = read('.specify/references/blocker-mediation.md');
    for (const label of ['Recommendation:', 'Why:', 'Next step:', 'Owner:', 'User action:']) {
      expect(canonical).toContain(label);
    }
    expect(canonical).toMatch(/Choice probabilities identify the\s+closest\s+alternative only/);
    expect(canonical).toMatch(/If the API\s+returns no\s+reason, say that the cause is unknown/);
    expect(canonical).toContain('Report independent gates separately');
    expect(read('extension/resources/references/blocker-mediation.md')).toBe(canonical);
    expect(read('plugins/eai-gofer/.specify/references/blocker-mediation.md')).toBe(canonical);
    expect(
      read('plugins/eai-gofer/plugins/eai-gofer/.specify/references/blocker-mediation.md')
    ).toBe(canonical);
  });

  it.each([
    '.specify/scripts/node',
    'extension/resources/node-scripts',
    'plugins/eai-gofer/.specify/scripts/node',
    'plugins/eai-gofer/plugins/eai-gofer/.specify/scripts/node',
  ])('executes the shipped helpers in %s', (folder) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-surface-check-'));
    const run = (script: string, args: string[]) =>
      spawnSync(process.execPath, [path.join(ROOT, folder, script), ...args], { encoding: 'utf8' });
    try {
      fs.writeFileSync(path.join(dir, 'draft.txt'), 'The CRUD benchmark needs a fixture pool.');
      expect(run('gofer-response-check.mjs', ['--input', path.join(dir, 'draft.txt')]).status).toBe(
        1
      );
      fs.writeFileSync(
        path.join(dir, 'draft.txt'),
        'The access checks passed. We can now compare the two methods fairly.'
      );
      expect(run('gofer-response-check.mjs', ['--input', path.join(dir, 'draft.txt')]).status).toBe(
        0
      );
      fs.writeFileSync(
        path.join(dir, 'draft.txt'),
        [
          'Recommendation: Reconcile before continuing.',
          'Why: The confidence is below the configured threshold.',
          'Next step: Review the missing evidence.',
          'Owner: Gofer.',
          'User action: Not required.',
        ].join('\n')
      );
      expect(
        run('gofer-response-check.mjs', [
          '--input',
          path.join(dir, 'draft.txt'),
          '--kind',
          'answer',
          '--business-update',
        ]).status
      ).toBe(0);
      fs.writeFileSync(path.join(dir, 'draft.txt'), 'The review is blocked.');
      expect(
        run('gofer-response-check.mjs', [
          '--input',
          path.join(dir, 'draft.txt'),
          '--kind',
          'answer',
          '--business-update',
        ]).status
      ).toBe(1);
      for (const file of ['spec.md', 'plan.md', 'traceability.md'])
        fs.writeFileSync(path.join(dir, file), 'FR-001: A bounded non-app review.');
      fs.writeFileSync(path.join(dir, 'tasks.md'), '- [ ] T001 Review the result.');
      expect(run('gofer-delivery-check.mjs', ['--feature-dir', dir, '--capture']).status).toBe(0);
      expect(run('gofer-delivery-check.mjs', ['--feature-dir', dir]).status).toBe(0);
      fs.appendFileSync(path.join(dir, 'spec.md'), '\nNew scope.');
      expect(run('gofer-delivery-check.mjs', ['--feature-dir', dir]).status).toBe(1);
      expect(read(`${folder}/gofer-delivery-check.mjs`)).toBe(
        read('.specify/scripts/node/gofer-delivery-check.mjs')
      );
      const preEditHelp = run('gofer-pre-edit-check.mjs', ['--help']);
      expect(preEditHelp.status).toBe(0);
      expect(preEditHelp.stdout).toContain('--jev-chat-readiness');
      expect(read(`${folder}/gofer-pre-edit-check.mjs`)).toBe(
        read('.specify/scripts/node/gofer-pre-edit-check.mjs')
      );
      expect(read(`${folder}/gofer-response-check.mjs`)).toBe(
        read('.specify/scripts/node/gofer-response-check.mjs')
      );
      expect(read(`${folder}/gofer-semantic-drift.mjs`)).toBe(
        read('.specify/scripts/node/gofer-semantic-drift.mjs')
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
