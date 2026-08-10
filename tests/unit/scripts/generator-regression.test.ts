/**
 * T054 — Generator regression test.
 *
 * Verifies:
 * 1. Running the generator with --dry-run does NOT modify existing .claude/commands/ files
 * 2. The generator exits with code 0 on success
 * 3. The generator fails fast when .specify/commands/ is missing
 * 4. All 16 expected pipeline stages plus 3 control commands are processed when --dry-run is passed
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  CONTROL_COMMANDS,
  FULL_COMMAND_COUNT,
  PIPELINE_STAGE_COUNT,
  PIPELINE_STAGE_FILES,
} from '../../helpers/goferCommandSet';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const GENERATOR_SCRIPT = path.join(
  PROJECT_ROOT,
  '.specify',
  'scripts',
  'node',
  'generate-commands.mjs'
);
const CLAUDE_COMMANDS_DIR = path.join(PROJECT_ROOT, '.claude', 'commands');
const SPECIFY_COMMANDS_DIR = path.join(PROJECT_ROOT, '.specify', 'commands');

const EXPECTED_PIPELINE_STAGES = [...PIPELINE_STAGE_FILES];
const EXPECTED_CONTROL_COMMANDS = CONTROL_COMMANDS.map((command) => command.file);

// ---------------------------------------------------------------------------
// Snapshot of .claude/commands/ before the test suite runs
// ---------------------------------------------------------------------------

interface FileSnapshot {
  name: string;
  content: string;
  mtime: number;
}

const snapshotBefore: FileSnapshot[] = [];

beforeAll(async () => {
  const entries = await fs.readdir(CLAUDE_COMMANDS_DIR);
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(CLAUDE_COMMANDS_DIR, entry);
    const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    snapshotBefore.push({ name: entry, content, mtime: stat.mtimeMs });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generator regression (T054)', () => {
  // -------------------------------------------------------------------------
  // 1. --dry-run exits with code 0
  // -------------------------------------------------------------------------
  describe('--dry-run mode', () => {
    let stdout: string;
    let exitCode: number | null;

    beforeAll(async () => {
      try {
        const result = await execFileAsync('node', [
          GENERATOR_SCRIPT,
          '--dry-run',
          '--root',
          PROJECT_ROOT,
        ]);
        stdout = result.stdout;
        exitCode = 0;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; code?: number };
        stdout = e.stdout ?? '';
        exitCode = e.code ?? 1;
      }
    });

    it('exits with code 0', () => {
      expect(exitCode).toBe(0);
    });

    it('outputs [dry-run] prefix in stdout', () => {
      expect(stdout).toContain('[dry-run]');
    });

    it('reports canonical descriptions OK', () => {
      expect(stdout).toContain('Canonical descriptions OK');
    });

    it(`reports all ${FULL_COMMAND_COUNT} stages loaded`, () => {
      // The generator logs: "Loaded N stage(s): ..."
      const match = stdout.match(/Loaded (\d+) stage\(s\)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(FULL_COMMAND_COUNT);
    });

    it('lists all expected pipeline stage names in output', () => {
      for (const stage of EXPECTED_PIPELINE_STAGES) {
        expect(stdout, `Expected stage '${stage}' to appear in --dry-run output`).toContain(stage);
      }
    });

    it('lists all expected control command names (namespaced) in output', () => {
      // Control commands appear in the loaded list using their canonical
      // namespaced name (e.g. `gofer:plan`), not their filename slug.
      for (const { name } of CONTROL_COMMANDS) {
        expect(
          stdout,
          `Expected control command '${name}' to appear in --dry-run output`
        ).toContain(name);
      }
    });

    it('does NOT modify any .claude/commands/ files', async () => {
      for (const snap of snapshotBefore) {
        const filePath = path.join(CLAUDE_COMMANDS_DIR, snap.name);
        const [currentContent, currentStat] = await Promise.all([
          fs.readFile(filePath, 'utf8'),
          fs.stat(filePath),
        ]);
        expect(currentContent, `File ${snap.name} was modified by --dry-run`).toBe(snap.content);
        expect(currentStat.mtimeMs, `File ${snap.name} mtime changed during --dry-run`).toBe(
          snap.mtime
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Fails fast when .specify/commands/ is missing
  // -------------------------------------------------------------------------
  describe('missing .specify/commands/ directory', () => {
    let tmpRoot: string;
    let stdout: string;
    let stderr: string;
    let exitCode: number | null;

    beforeAll(async () => {
      // Create a minimal temp root with NO .specify/commands/ directory
      tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-gen-missing-'));

      try {
        const result = await execFileAsync('node', [
          GENERATOR_SCRIPT,
          '--dry-run',
          '--root',
          tmpRoot,
        ]);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = 0;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; code?: number };
        stdout = e.stdout ?? '';
        stderr = e.stderr ?? '';
        exitCode = e.code ?? 1;
      }
    });

    afterAll(async () => {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    });

    it('exits with code 1 when the commands directory is missing', () => {
      expect(exitCode).toBe(1);
    });

    it('reports a stage-loading error about missing .specify/commands/', () => {
      const combined = stdout + stderr;
      expect(combined).toContain(
        'Canonical command normalization failed: .specify/commands/ not found'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. All 16 pipeline stages + 3 control commands are present in .specify/commands/
  // -------------------------------------------------------------------------
  describe('stage manifest completeness', () => {
    it(`has exactly ${FULL_COMMAND_COUNT} .md files in .specify/commands/`, async () => {
      const entries = await fs.readdir(SPECIFY_COMMANDS_DIR);
      const mdFiles = entries.filter((e) => e.endsWith('.md') && e !== '.gitkeep');
      expect(mdFiles).toHaveLength(FULL_COMMAND_COUNT);
    });

    it(`contains all ${PIPELINE_STAGE_COUNT} expected pipeline stage files`, async () => {
      const entries = await fs.readdir(SPECIFY_COMMANDS_DIR);
      const stageNames = entries
        .filter((e) => e.endsWith('.md') && e !== '.gitkeep')
        .map((e) => e.replace(/\.md$/, ''));

      for (const expected of EXPECTED_PIPELINE_STAGES) {
        expect(stageNames, `Missing stage file: ${expected}.md`).toContain(expected);
      }
    });

    it('contains all expected control and helper command files', async () => {
      const entries = await fs.readdir(SPECIFY_COMMANDS_DIR);
      const stageNames = entries
        .filter((e) => e.endsWith('.md') && e !== '.gitkeep')
        .map((e) => e.replace(/\.md$/, ''));

      for (const expected of EXPECTED_CONTROL_COMMANDS) {
        expect(stageNames, `Missing control command file: ${expected}.md`).toContain(expected);
      }
    });
  });
});
