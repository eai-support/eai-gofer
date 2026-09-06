import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FULL_COMMAND_FILES, PUBLIC_ENTRYPOINT_FILES } from '../../helpers/goferCommandSet';

const root = path.resolve(__dirname, '../../..');

describe('retired Gemini extension replacement layout', () => {
  it.each([
    '.gemini/extension.json',
    'gemini-extension.json',
    '.gemini/commands/gofer/eai.toml',
    '.gemini/commands/gofer/eai-update.toml',
    '.gemini/commands/gofer/manifest.json',
  ])('does not publish retired %s', (relative) => {
    expect(fs.existsSync(path.join(root, relative))).toBe(false);
  });

  it('retains Gemini-named workspace instructions for Antigravity', () => {
    expect(fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8')).toContain('AGENTS.md');
  });

  it.each(PUBLIC_ENTRYPOINT_FILES)(
    'uses shared native skill %s rather than a TOML wrapper',
    (entry) => {
      const content = fs.readFileSync(path.join(root, '.agents/skills', entry, 'SKILL.md'), 'utf8');
      expect(content).toMatch(new RegExp('^name: ' + entry + '$', 'm'));
      expect(content).toMatch(/^description: .+/m);
      expect(content).toContain('Antigravity');
    }
  );

  it('keeps every internal stage and helper private and available', () => {
    expect(FULL_COMMAND_FILES).toHaveLength(26);
    for (const stage of FULL_COMMAND_FILES) {
      expect(fs.existsSync(path.join(root, '.specify/commands', stage + '.md'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.agents/skills', stage, 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.gemini/commands/gofer', stage + '.toml'))).toBe(false);
    }
  });
});
