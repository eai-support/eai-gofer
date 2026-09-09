import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as generator from '../../../.specify/scripts/node/generate-commands.mjs';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const commands = fs
  .readdirSync(path.join(root, '.specify/commands'))
  .filter((f) => f.endsWith('.md'));
const entry = { name: 'eai', stem: 'eai', title: 'Eai', description: 'Continue delivery' };

describe('desktop continuation contract', () => {
  it.each(commands)('%s preserves the shared continuation and stop contract', (file) => {
    const content = read(`.specify/commands/${file}`);
    expect(content).not.toMatch(/Skill tool|skill=["`]\/?\d/);
    expect(content.split('<!-- gofer:continuation:start -->')).toHaveLength(2);
    expect(content).toContain(generator.buildContinuationContractSection());
  });

  it('preserves scope, safety gates, bounded retries and explicit stop reporting', () => {
    const contract = generator.buildContinuationContractSection();
    for (const text of [
      'Progress',
      'Stop reason',
      'Next action',
      'same conversation',
      'tool proposal is not execution',
      'missing or ambiguous approval is not approval',
      'explicit plan/task approval',
      'material scope',
      'protected files',
      'budget, context and retry limits',
      'research-only',
      'MVP',
    ])
      expect(contract).toContain(text);
  });

  it('requires business approval before planning and reuses covered task approval', () => {
    expect(read('.specify/commands/2_gofer_specify.md')).toContain(
      'Before continuing to planning, verify approval'
    );
    const tasks = read('.specify/commands/4_gofer_tasks.md');
    expect(tasks).toContain('If the approved business scope already covers these tasks');
    expect(tasks).toContain('approvalBasis');
    expect(tasks).not.toContain(
      'Tasks MUST be reviewed and approved before implementation begins.'
    );
    expect(tasks).toContain('Otherwise, pause for the required approval');
  });

  it('keeps internal file targets, optional problem validation and terminal validation', () => {
    for (const [current, next] of [
      ['0_gofer_start', '1_gofer_research'],
      ['0a_problem_validation', '1_gofer_research'],
      ['1_gofer_research', '2_gofer_specify'],
      ['2_gofer_specify', '3_gofer_plan'],
      ['3_gofer_plan', '4_gofer_tasks'],
      ['4_gofer_tasks', '5_gofer_implement'],
      ['5_gofer_implement', '6_gofer_validate'],
    ]) {
      const result = generator.injectPipelineContinuation('# Stage\n', 'copilot', current);
      expect(result).toContain(`.specify/commands/${next}.md`);
      expect(fs.existsSync(path.join(root, `.specify/commands/${next}.md`))).toBe(true);
      expect(result).not.toMatch(/Next Command|Skill tool|manually run/);
      expect(generator.injectPipelineContinuation(result, 'copilot', current)).toBe(result);
    }
    expect(
      generator.injectPipelineContinuation('# Validate\n', 'copilot', '6_gofer_validate')
    ).not.toContain('Next internal contract');
    expect(read('.specify/commands/1_gofer_research.md')).toContain(
      'Unless the user explicitly asks to stop after'
    );
    expect(read('.specify/commands/0_gofer_start.md').includes('auto-invokes')).toBe(false);
  });

  it('uses portable native tools without making optional MCP or VS Code tools mandatory', () => {
    const prompt = generator.buildPublicEntrypointPrompt(entry, [], 'copilot');
    expect(prompt.split('---')[1]).not.toMatch(/^tools:/m);
    expect(prompt).toContain(generator.buildContinuationContractSection());
    for (const agent of generator.getGithubAgentSpecs()) {
      expect(agent.tools).toEqual(expect.arrayContaining(['read', 'search', 'edit']));
      expect(
        agent.tools.every((tool: string) => ['read', 'search', 'edit', 'execute'].includes(tool))
      ).toBe(true);
      // Intake also runs workspace preflight and must not create a new tool dead end.
      expect(agent.tools).toContain('execute');
      const content = generator.buildGithubAgentContent(agent);
      expect(content).toContain(generator.buildContinuationContractSection());
      expect(content).toContain('current agent');
    }
  });

  it('replaces the shared section idempotently without changing stage work', () => {
    const original = '# Stage\n\n## MVP\n\nKeep all required validation.\n';
    const once = generator.injectContinuationContract(original);
    expect(generator.injectContinuationContract(once)).toBe(once);
    expect(once).toContain('Keep all required validation.');
  });

  it('retains an authoritative shared contract when normalizing legacy control commands', () => {
    const source = read('.specify/scripts/node/generate-commands.mjs');
    expect(source).not.toContain('if (LEGACY_HELPER_COMMAND_FILES.has(entry)) continue;');
  });
});
