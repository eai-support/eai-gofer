import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const records = ['spec.md', 'plan.md', 'tasks.md', 'traceability.md', 'validation-report.md'];
function assertContract(content: string) {
  for (const record of records) expect(content).toContain(record);
  expect(content).toContain('before implementation continues');
  expect(content).toContain('active validation scope');
  expect(content).toContain('mark affected old evidence pending');
  expect(content).toContain('Loop records supplement');
  expect(content).toContain('A question alone does not authorize artifact edits');
  expect(content).toContain('no implemented or required authentication needs no login');
  expect(content).toContain('confirmed non-app work exempt');
  expect(content).toContain('Read the test before claiming it covers that requirement');
  expect(content).toContain('Keep missing or unexecuted checks pending');
  expect(content).toContain('Count the draft before sending and shorten it to fit');
}

describe('always-loaded six-surface scope contract', () => {
  it('ships the same always-on contract in the VS Code initializer and generated entrypoint', async () => {
    const template = await readFile(
      path.join(root, 'extension/resources/instruction-templates/workflow/always-on-eai.md'),
      'utf8'
    );
    const entrypoint = await readFile(
      path.join(root, 'extension/resources/copilot-prompts/eai.prompt.md'),
      'utf8'
    );
    const block = entrypoint.match(
      /## Always-On EAI Contract[\s\S]*?<!-- gofer:always-on-eai:end -->/
    )?.[0];
    expect(template.trim()).toBe(block);
    assertContract(template);
  });
  it.each([
    'generate-commands.mjs',
    'package-agent-plugin.mjs',
    'workspace-bootstrap-lib.mjs',
    'gofer-surface-update.mjs',
  ])('keeps the full rule inside the managed block in %s', async (file) => {
    const source = await readFile(path.join(root, '.specify/scripts/node', file), 'utf8');
    const body =
      file === 'gofer-surface-update.mjs'
        ? source.split('const ALWAYS_ON_EAI_SECTION = `')[1]?.split('${ALWAYS_ON_EAI_END}')[0]
        : source
            .split('return `## Always-On EAI Contract')[1]
            ?.split('<!-- gofer:always-on-eai:end -->')[0];
    expect(body).toBeTruthy();
    assertContract(body!);
  });

  it('updates stale user instructions idempotently without removing unrelated text', async () => {
    const url = new URL('../../../.specify/scripts/node/gofer-surface-update.mjs', import.meta.url);
    const { upsertAlwaysOnEaiSection } = await import(url.href);
    const input =
      '# Personal rules\nKeep my conventions.\n\n## Always-On EAI Contract\n<!-- gofer:always-on-eai:start -->\nOld rule.\n<!-- gofer:always-on-eai:end -->\n\n# Other rules\nDo not remove.\n';
    const output = upsertAlwaysOnEaiSection(input);
    assertContract(output);
    expect(output).toContain('Keep my conventions.');
    expect(output).toContain('Do not remove.');
    expect(output).not.toContain('Old rule.');
    expect(upsertAlwaysOnEaiSection(output)).toBe(output);
  });

  it('puts the complete rule in bootstrap AGENTS, including for plain requests', async () => {
    const url = new URL(
      '../../../.specify/scripts/node/workspace-bootstrap-lib.mjs',
      import.meta.url
    );
    const { buildAgentsMd } = await import(url.href);
    assertContract(
      buildAgentsMd({ name: 'fixture', language: 'javascript', packageManager: 'npm' }, [])
    );
  });
});
