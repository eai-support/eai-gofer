import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const stages = fs
  .readdirSync(path.join(root, '.specify/commands'))
  .filter((f) => f.endsWith('.md'));

describe('blocker control preservation across surfaces', () => {
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
    'plugins/eai-gofer/skills/eai/SKILL.md',
    'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
    'extension/resources/copilot-prompts/eai.prompt.md',
    ...['business', 'research', 'plan', 'implement', 'validate'].map(
      (name) => `.github/agents/gofer-${name}.agent.md`
    ),
    ...stages.map((file) => `.specify/commands/${file}`),
  ])('keeps bounded continuation and blocker rules in %s', (file) => {
    const text = read(file);
    expect(text).toContain('gofer-blocker-control.mjs');
    expect(text).toContain('An unanswered question is not new evidence');
    expect(text).toContain('one investigation and one different recovery');
    expect(text).toContain('Continue only approved tasks that do not depend on it');
    expect(text).toContain('Conversation-only work uses a private session state directory');
    expect(text).toContain('this helper cannot intercept calls that a host sends directly');
    expect(text).toContain('including read-only, plan-only, research-only and MVP work');
    expect(text).toContain('Stage completion alone is not pipeline completion');
    expect(text.match(/\*\*Blocker Mediation\*\*/g)).toHaveLength(1);
  });

  it.each(['.agents/skills/eai-update/SKILL.md', 'plugins/eai-gofer/skills/eai-update/SKILL.md'])(
    'also bounds maintenance without starting delivery: %s',
    (file) => {
      const text = read(file);
      expect(text).toContain('gofer-blocker-control.mjs');
      expect(text).toContain('one investigation and one different recovery');
      expect(text).toContain('Conversation-only work uses a private session state directory');
      expect(text).toContain('Do not run');
      expect(text.match(/\*\*Blocker Mediation\*\*/g)).toHaveLength(1);
    }
  );

  it.each([
    '.specify/scripts/node',
    'extension/resources/node-scripts',
    'plugins/eai-gofer/.specify/scripts/node',
    'plugins/eai-gofer/plugins/eai-gofer/.specify/scripts/node',
  ])('executes shipped state controls from %s without app setup', (folder) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-shipped-blocker-'));
    const helper = path.join(root, folder, 'gofer-blocker-control.mjs');
    const run = (event?: Record<string, unknown>) => {
      const file = path.join(dir, 'event.json');
      if (event) fs.writeFileSync(file, JSON.stringify(event));
      return spawnSync(
        process.execPath,
        [helper, '--state-dir', dir, ...(event ? ['--event', file] : [])],
        { encoding: 'utf8' }
      );
    };
    try {
      expect(run().status).toBe(0);
      const opened = run({
        action: 'open',
        goalKey: 'research',
        subjectKey: 'source',
        conditionKey: 'access',
        category: 'access',
        owner: 'user',
        question: 'Can you provide the source?',
        requiredChange: 'Source supplied.',
        tasks: [],
      });
      expect(opened.status).toBe(0);
      const blockerId = JSON.parse(opened.stdout).blockerId;
      expect(run({ action: 'ask', blockerId }).status).toBe(1);
      fs.writeFileSync(
        path.join(dir, 'diagnostic-output.txt'),
        'Controlled source fixture absent.'
      );
      fs.writeFileSync(
        path.join(dir, 'diagnosis.json'),
        JSON.stringify({
          evidence: 'diagnostic-output.txt',
          sha256: createHash('sha256').update('Controlled source fixture absent.').digest('hex'),
          blockerId,
          kind: 'diagnosis',
          classification: 'environment',
          checkedAt: new Date().toISOString(),
          command: 'read controlled source fixture',
          observed: 'Fixture source is absent.',
          source: 'test:source',
          selfCauseChecked: true,
          selfCauseCheck: 'Checked the expected fixture path.',
          authorizedRepairAvailable: false,
          authorityCheck: 'User owns the absent source.',
          noSafeAlternativeReason: 'Do not invent source evidence.',
        })
      );
      expect(run({ action: 'ask', blockerId, verification: 'diagnosis.json' }).status).toBe(0);
      expect(run({ action: 'ask', blockerId }).status).toBe(1);
      expect(run({ action: 'attempt', blockerId, approachKey: 'retry' }).status).toBe(1);
      expect(run().status).toBe(1);
      expect(fs.existsSync(path.join(dir, '.specify'))).toBe(false);
      expect(read(`${folder}/gofer-blocker-control.mjs`)).toBe(
        read('.specify/scripts/node/gofer-blocker-control.mjs')
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
