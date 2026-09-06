/**
 * Static replacement-layout checks, not native Antigravity runtime tests.
 * The legacy filename is retained so existing test selectors still cover migration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FULL_COMMAND_FILES, PUBLIC_ENTRYPOINT_FILES } from '../../helpers/goferCommandSet';

const root = path.resolve(__dirname, '../../..');

describe('Antigravity workspace skill shape replacing Gemini CLI', () => {
  it('keeps Gemini-named context while removing the old extension contract', () => {
    expect(fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8')).toContain('AGENTS.md');
    expect(fs.existsSync(path.join(root, '.gemini/extension.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.gemini/commands/gofer/manifest.json'))).toBe(false);
  });

  it.each(PUBLIC_ENTRYPOINT_FILES)(
    'shares %s with Codex without a duplicate command tree',
    (name) => {
      const skill = fs.readFileSync(path.join(root, '.agents/skills', name, 'SKILL.md'), 'utf8');
      expect(skill).toMatch(/^---\r?\n/);
      expect(skill).toMatch(new RegExp('^name: ' + name + '$', 'm'));
      expect(skill).toMatch(/^description: .+/m);
      expect(skill).toContain('Antigravity CLI');
      expect(skill).toContain('Antigravity desktop');
      expect(skill).toContain('Replace `<host>`');
      expect(skill).not.toContain('--host gemini');
      expect(fs.existsSync(path.join(root, '.gemini/commands/gofer', name + '.toml'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.antigravity/commands', name + '.md'))).toBe(false);
    }
  );

  it('keeps all pipeline and helper stages internal', () => {
    for (const stage of FULL_COMMAND_FILES) {
      expect(fs.existsSync(path.join(root, '.specify/commands', stage + '.md'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.agents/skills', stage, 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.gemini/commands/gofer', stage + '.toml'))).toBe(false);
    }
  });
});
