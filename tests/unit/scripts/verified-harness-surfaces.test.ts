import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  buildContinuationContractSection,
  injectContinuationContract,
} from '../../../.specify/scripts/node/generate-commands.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('Verified harness instruction and release preservation (not native execution)', () => {
  for (const file of [
    '.agents/skills/eai/SKILL.md',
    '.system/skills/eai/SKILL.md',
    '.claude/skills/eai/SKILL.md',
    '.github/skills/eai/SKILL.md',
    '.github/prompts/eai.prompt.md',
    '.grok/skills/eai/SKILL.md',
    '.gemini/commands/gofer/eai.md',
    '.github/agents/gofer-validate.agent.md',
  ]) {
    it(`retains shared obligations and native qualification limits in ${file}`, () => {
      expect(read(file)).toContain(buildContinuationContractSection());
      expect(read(file)).toContain('never relabel self-review as independent');
      expect(read(file)).toContain('Preserve normal safe Gofer work');
    });
  }
  it('keeps every internal stage and helper while adding idempotent guidance', () => {
    const files = readdirSync(path.join(root, '.specify/commands')).filter((f) =>
      f.endsWith('.md')
    );
    expect(files).toHaveLength(26);
    for (const file of files) {
      const body = read(`.specify/commands/${file}`);
      expect(body).toContain('## Verified Specialist Execution');
      expect(injectContinuationContract(injectContinuationContract(body))).toBe(
        injectContinuationContract(body)
      );
    }
  });
  it('preserves all six required validation specialties without a forced native Task invocation', () => {
    const body = read('.specify/commands/6_gofer_validate.md');
    for (const role of [
      'correctness',
      'security',
      'performance',
      'test-quality',
      'integration',
      'standards',
    ])
      expect(body).toContain(`validation-${role}`);
    expect(body).toContain(
      'Complete all six specialist reviews through separate qualified executions'
    );
    expect(body).not.toContain('**MUST** launch all 6 agents **in parallel** using the Task');
  });
  it('keeps experimental execution distinct from ordinary safe delivery and adds a release check', () => {
    const guidance = read('.specify/references/verified-agent-execution.md');
    expect(guidance).toContain('does not provide a sandbox');
    expect(guidance).toContain('Normal\nsafe Gofer use remains available');
    expect(read('release.sh')).toContain('npm run test:verified-harness');
    expect(JSON.parse(read('package.json')).scripts['test:verified-harness']).toContain(
      '--retry 0'
    );
  });
  it('ships the observed Antigravity isolation failure as a qualification block', () => {
    for (const file of [
      '.specify/references/verified-agent-execution.md',
      'extension/resources/references/verified-agent-execution.md',
    ]) {
      const guidance = read(file);
      expect(guidance).toContain('`agy` 1.2.4');
      expect(guidance).toContain('global Antigravity scratch');
      expect(guidance).toContain('directory instead of that workspace');
      expect(guidance).toContain('Do not qualify Antigravity native delegation');
    }
  });
});
