import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
describe('safe preview rules across existing surfaces', () => {
  it('keeps real browser evidence in the release gate with no retries', () => {
    expect(read('release.sh')).toContain(
      'run_release_check "Gofer checked preview browser tests" npm exec -- playwright test tests/e2e/safe-preview.spec.ts --project chromium --workers 1 --retries 0'
    );
    expect(read('release.sh')).toContain('run_release_check "Gofer full Vitest suite" npm test');
  });
  it.each([
    '.agents/skills/eai/SKILL.md',
    '.system/skills/eai/SKILL.md',
    '.claude/skills/eai/SKILL.md',
    '.claude/commands/eai.md',
    '.github/skills/eai/SKILL.md',
    '.github/prompts/eai.prompt.md',
    '.gemini/commands/gofer/eai.md',
    '.grok/skills/eai/SKILL.md',
    'plugins/eai-gofer/skills/eai/SKILL.md',
    'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
    'extension/resources/copilot-prompts/eai.prompt.md',
    ...fs
      .readdirSync('.specify/commands')
      .filter((f) => f.endsWith('.md'))
      .map((f) => `.specify/commands/${f}`),
  ])('requires ownership and checked previews in %s', (file) => {
    const text = read(file);
    expect(text).toContain('Restart only this app');
    expect(text).toContain('Never stop another app');
    expect(text).toContain('Say ready to view only after those checks pass');
    expect(text).toContain('Local MVP checks cover only implemented behaviour');
    expect(text).toContain('Keep showing clearly labelled drafts without adding approval stops');
    expect(text).not.toContain('The runner must stop any process');
    expect(text).toContain('Blocker Mediation');
  });
  it.each([
    'extension/resources/node-scripts',
    'plugins/eai-gofer/.specify/scripts/node',
    'plugins/eai-gofer/plugins/eai-gofer/.specify/scripts/node',
  ])('ships the tested helper in %s', (folder) => {
    expect(read(`${folder}/gofer-ui-preview.mjs`)).toBe(
      read('.specify/scripts/node/gofer-ui-preview.mjs')
    );
  });
});
