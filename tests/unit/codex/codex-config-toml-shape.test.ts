/**
 * T169 — Validates codex-config.toml (at repo root) shape.
 *
 *   1. Is valid TOML (basic syntax: balanced brackets, key=value format)
 *   2. Contains [[skills.config]] blocks
 *   3. Has the public Gofer entrypoint set
 *   4. Each public entry has `path = "/full/path/to/repo/.agents/skills/<stage>"` and `enabled = true`
 *   5. NEVER mentions `skills_context_budget_percent` (Hard Invariant 2)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_COMMAND_NAMES,
  PUBLIC_ENTRYPOINT_COUNT,
  PUBLIC_ENTRYPOINT_NAMES,
} from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'codex-config.toml');

function toSkillDir(stageName: string): string {
  return stageName.replace(/:/g, '_').replace(/-/g, '_');
}

function toPublicSkillDir(stageName: string): string {
  return stageName.replace(/:/g, '_');
}

describe('codex-config.toml shape (T169)', () => {
  it('codex-config.toml exists at repo root', (): void => {
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
  });

  it('basic TOML syntax — non-comment lines are key=value or [[table]]', (): void => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      // Either an array-of-tables header `[[...]]` OR a key=value pair.
      const isHeader = /^\[\[[a-zA-Z0-9_.-]+\]\]$/.test(line);
      const isKeyValue = /^[a-zA-Z0-9_.-]+\s*=\s*.+$/.test(line);
      expect(isHeader || isKeyValue, `line is not valid TOML: "${line}"`).toBe(true);
    }
  });

  it('contains [[skills.config]] blocks', (): void => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    expect(content).toContain('[[skills.config]]');
  });

  it(`has exactly ${PUBLIC_ENTRYPOINT_COUNT} [[skills.config]] entries`, (): void => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    const matches = content.match(/^\[\[skills\.config\]\]/gm) || [];
    expect(matches.length).toBe(PUBLIC_ENTRYPOINT_COUNT);
  });

  it('every public Gofer entrypoint has a path-based enabled = true entry', (): void => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    for (const stage of PUBLIC_ENTRYPOINT_NAMES) {
      const re = new RegExp(
        `\\[\\[skills\\.config\\]\\][\\s\\S]*?path\\s*=\\s*"/full/path/to/repo/\\.agents/skills/${toPublicSkillDir(stage).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?enabled\\s*=\\s*true`,
        'm'
      );
      expect(re.test(content), `expected enabled=true entry for ${stage}`).toBe(true);
    }
    for (const stage of FULL_COMMAND_NAMES) {
      expect(content).not.toContain(`/.agents/skills/${toSkillDir(stage)}`);
    }
  });

  it('NEVER references skills_context_budget_percent (Hard Invariant 2)', (): void => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    expect(content).not.toContain('skills_context_budget_percent');
  });
});
