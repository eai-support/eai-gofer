/**
 * T071 — Unit tests for the AGENTS.md emitter (T067) in generate-commands.mjs.
 *
 * Verifies that:
 * 1. AGENTS.md is created with correct content
 * 2. All portable stages appear as sections
 * 3. Formerly Claude-only stages appear when they list portable surfaces
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
// Fixtures — multiple portable stages including formerly Claude-only stages
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
  - agents-skills
  - gemini
  - codex
---

# Gofer Research

This is the research stage body content.
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
  - agents-skills
  - gemini
  - codex
---

# Problem Validation

Validate the business problem before design.
`;

const SPECIFY_STAGE = `---
name: 2_gofer_specify
description: "Create feature specification informed by codebase research."
title: "Gofer Specify"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - agents-skills
  - gemini
  - codex
---

# Gofer Specify

Create a feature specification.
`;

const CLAUDE_ONLY_STAGE = `---
name: 0_gofer_start
description: "Define the business problem and scenario for Gofer to analyse and solve."
title: "Business Scenario"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - agents-skills
  - gemini
  - codex
---

# Business Scenario

This stage is portable.
`;

const GOFER_SAVE_STAGE = `---
name: 7_gofer_save
description: "Save session progress."
title: "Gofer Save"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - agents-skills
  - gemini
  - codex
---

# Gofer Save

Save progress for later.
`;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-emitter-agents-md-test-'));

  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '1_gofer_research.md'),
    RESEARCH_STAGE
  );
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '0a_problem_validation.md'),
    PROBLEM_VALIDATION_STAGE
  );
  await writeFile(path.join(tmpRoot, '.specify', 'commands', '2_gofer_specify.md'), SPECIFY_STAGE);
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '0_gofer_start.md'),
    CLAUDE_ONLY_STAGE
  );
  await writeFile(path.join(tmpRoot, '.specify', 'commands', '7_gofer_save.md'), GOFER_SAVE_STAGE);

  const scriptPath = fileURLToPath(generateCommandsUrl);
  await execFileAsync('node', [scriptPath, '--root', tmpRoot, '--surfaces', 'agents-md']);
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agents-md emitter (T067)', () => {
  it('creates .agents/AGENTS.md', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    expect(await fileExists(outPath)).toBe(true);
  });

  it('AGENTS.md contains the correct header', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toContain('# Gofer Agent Commands');
    expect(content).toContain('## Public Entrypoints');
    expect(content).toContain('## Commands');
  });

  it('AGENTS.md contains a Generated timestamp', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toMatch(/Generated: \d{4}-\d{2}-\d{2}T/);
  });

  it('AGENTS.md documents the public entrypoints', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toContain('`gofer` - Start or continue Gofer');
    expect(content).toContain('`eai-gofer` - Alias');
  });

  it('AGENTS.md contains internal contract entries for stages', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toContain('`1_gofer_research` - Research codebase');
    expect(content).toContain('`0a_problem_validation` - Validate the business problem');
    expect(content).toContain('`2_gofer_specify` - Create feature specification');
  });

  it('AGENTS.md does not generate old per-stage prose sections', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).not.toContain('### Gofer Research');
    expect(content).not.toContain('# Gofer Research\n\nThis is the research stage body content.');
  });

  it('contains 0_gofer_start as an internal contract', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toContain('`0_gofer_start`');
    expect(content).not.toContain('claude-only');
  });

  it('contains 7_gofer_save as an internal contract', async () => {
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    expect(content).toContain('`7_gofer_save`');
  });

  it('contains every fixture stage as an internal contract name', async () => {
    const expectedContracts = [
      '`1_gofer_research`',
      '`0a_problem_validation`',
      '`2_gofer_specify`',
      '`0_gofer_start`',
      '`7_gofer_save`',
    ];
    const outPath = path.join(tmpRoot, '.agents', 'AGENTS.md');
    const content = await readFile(outPath);
    for (const contract of expectedContracts) {
      expect(content).toContain(contract);
    }
  });
});
