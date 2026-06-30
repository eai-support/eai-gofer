/**
 * T137 — codex-flat-tree-acceptance.test.ts
 *
 * Verifies that the agents-skills emitter writes a flat per-stage tree:
 *
 *   .agents/skills/<stage>/SKILL.md
 *
 * Depth must not exceed 3 levels under `.agents/skills/`. There must be
 * NO nested `gofer/gofer/...` (anti-tenant nesting) anywhere in the tree.
 *
 * (FR-008 / US6 AC-5.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const COMMANDS_SRC = path.join(PROJECT_ROOT, '.specify/commands');
const GENERATOR = path.join(PROJECT_ROOT, '.specify/scripts/node/generate-commands.mjs');

describe('Codex agents-skills flat tree (T137 / FR-008)', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'codex-flat-tree-'));
    // Mirror the source-of-truth into the temp root so the generator finds it
    mkdirSync(path.join(tmp, '.specify'), { recursive: true });
    cpSync(COMMANDS_SRC, path.join(tmp, '.specify/commands'), {
      recursive: true,
    });
    // Also need scripts dir? generator runs from its own absolute path; only --root matters.

    const result = spawnSync(
      process.execPath,
      [GENERATOR, '--root', tmp, '--surfaces', 'agents-skills'],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      console.error('generator stdout:', result.stdout);

      console.error('generator stderr:', result.stderr);
      throw new Error(`generator exited with status ${result.status}`);
    }
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('agents-skills root exists', () => {
    const skillsRoot = path.join(tmp, '.agents/skills');
    expect(existsSync(skillsRoot)).toBe(true);
  });

  it('every SKILL.md sits at exactly .agents/skills/<stage>/SKILL.md', () => {
    const skillsRoot = path.join(tmp, '.agents/skills');
    const stageDirs = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    expect(stageDirs.length).toBeGreaterThan(0);

    for (const stage of stageDirs) {
      const skillFile = path.join(skillsRoot, stage, 'SKILL.md');
      expect(existsSync(skillFile)).toBe(true);
    }
  });

  it('no nested .agents/skills/gofer/gofer/ directory exists (no tenant nesting)', () => {
    const nested = path.join(tmp, '.agents/skills/gofer/gofer');
    expect(existsSync(nested)).toBe(false);
  });

  it('formerly Claude-only stages are emitted to agents-skills', () => {
    const skillsRoot = path.join(tmp, '.agents/skills');
    const formerlyClaudeOnly = [
      '0_business_scenario',
      'gofer_constitution',
      'gofer_hydrate',
      '7_gofer_save',
      '8_gofer_branding',
    ];
    for (const stage of formerlyClaudeOnly) {
      const dir = path.join(skillsRoot, stage);
      expect(existsSync(dir)).toBe(true);
    }
  });

  it('depth of every SKILL.md is exactly 3 segments below project root: .agents/skills/<stage>/SKILL.md', () => {
    const skillsRoot = path.join(tmp, '.agents/skills');
    const stageDirs = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const stage of stageDirs) {
      const skillFile = path.join(skillsRoot, stage, 'SKILL.md');
      const rel = path.relative(tmp, skillFile);
      // Expect 4 segments: .agents / skills / <stage> / SKILL.md
      const parts = rel.split(path.sep);
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('.agents');
      expect(parts[1]).toBe('skills');
      expect(parts[3]).toBe('SKILL.md');
    }
  });
});
