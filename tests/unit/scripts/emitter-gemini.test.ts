/**
 * T070 — Unit tests for the Gemini emitter (T065/T066) in generate-commands.mjs.
 *
 * Verifies that:
 * 1. emitGemini writes correct files for every stage with the gemini surface
 * 2. emitGemini includes formerly Claude-only stages when they list gemini
 * 3. manifest.json contains correct stage list in alphabetical order
 * 4. manifest.json is valid JSON
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const generateCommandsUrl = new URL(
  '../../../.specify/scripts/node/generate-commands.mjs',
  import.meta.url
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Fixtures — all stages list the gemini surface
// ---------------------------------------------------------------------------

const RESEARCH_STAGE = `---
name: 1_gofer_research
description: "Research codebase, CLI integrations, and technology landscape for the target feature."
title: "Gofer Research"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - copilot
  - github-prompts
  - agents-skills
  - system-skills
  - gemini
  - codex
---

# Gofer Research

This is the research stage body content.

## Instructions

1. Analyse the codebase
2. Identify integration points
`;

const PROBLEM_VALIDATION_STAGE = `---
name: 0a_problem_validation
description: "Validate the business problem using 5 Whys root-cause analysis and stakeholder mapping."
title: "Problem Validation"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - copilot
  - github-prompts
  - agents-skills
  - system-skills
  - gemini
  - codex
---

# Problem Validation

Validate the business problem before design.
`;

const CLAUDE_ONLY_STAGE = `---
name: 0_gofer_start
description: "Define the business problem and scenario for Gofer to analyse and solve."
title: "Business Scenario"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - gemini
---

# Business Scenario

This is the business scenario body.
`;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-emitter-gemini-test-'));

  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '1_gofer_research.md'),
    RESEARCH_STAGE
  );
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '0a_problem_validation.md'),
    PROBLEM_VALIDATION_STAGE
  );
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '0_gofer_start.md'),
    CLAUDE_ONLY_STAGE
  );

  const scriptPath = fileURLToPath(generateCommandsUrl);
  await execFileAsync('node', [scriptPath, '--root', tmpRoot, '--surfaces', 'gemini']);
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gemini emitter (T065)', () => {
  it('emits 1_gofer_research.md to .gemini/commands/gofer/', async () => {
    const outPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', '1_gofer_research.md');
    expect(await fileExists(outPath)).toBe(true);
  });

  it('emits 0a_problem_validation.md to .gemini/commands/gofer/', async () => {
    const outPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', '0a_problem_validation.md');
    expect(await fileExists(outPath)).toBe(true);
  });

  it('written file contains plain markdown body (no frontmatter)', async () => {
    const outPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', '1_gofer_research.md');
    const content = await readFile(outPath);
    expect(content).toContain('# Gofer Research');
    expect(content).toContain('This is the research stage body content.');
    expect(content).not.toContain('name: 1_gofer_research');
    expect(content).not.toContain('category: pipeline');
  });

  it('emits formerly Claude-only stage 0_gofer_start', async () => {
    const outPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', '0_gofer_start.md');
    expect(await fileExists(outPath)).toBe(true);
  });

  it('emits TOML for formerly Claude-only stage 0_gofer_start', async () => {
    const outPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', '0_gofer_start.toml');
    expect(await fileExists(outPath)).toBe(true);
  });
});

describe('gemini manifest (T066)', () => {
  it('creates manifest.json in .gemini/commands/gofer/', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    expect(await fileExists(manifestPath)).toBe(true);
  });

  it('manifest.json is valid JSON', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const content = await readFile(manifestPath);
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('manifest has version "1.0"', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    expect(manifest.version).toBe('1.0');
  });

  it('manifest has a generated ISO timestamp', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    expect(manifest.generated).toBeDefined();
    expect(new Date(manifest.generated).toISOString()).toBe(manifest.generated);
  });

  it('manifest.commands contains all emitted stages', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    expect(manifest.commands).toContain('1_gofer_research');
    expect(manifest.commands).toContain('0a_problem_validation');
    expect(manifest.commands).toContain('0_gofer_start');
  });

  it('manifest.commands is sorted alphabetically', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    const sorted = [...manifest.commands].sort();
    expect(manifest.commands).toEqual(sorted);
  });

  it('manifest.commands includes 0_gofer_start', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    expect(manifest.commands).toContain('0_gofer_start');
  });

  it('manifest.commands contains no excluded stages because exclusions are empty', async () => {
    const manifestPath = path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath));
    expect(manifest.commands).toEqual([
      '0_gofer_start',
      '0a_problem_validation',
      '1_gofer_research',
    ]);
  });
});
