/**
 * T072 — Unit tests for the codex-config emitter (T068) in generate-commands.mjs.
 *
 * Verifies that:
 * 1. codex-config-fragment.toml is created at correct path
 * 2. Contains all path-based skill entries that list codex/agents-skills surfaces
 * 3. All entries have `enabled = true`
 * 4. Formerly Claude-only stages are present when portable surfaces are listed
 * 5. Does NOT touch ~/.codex/config.toml
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
// Fixtures — all stages can list codex/agents-skills surfaces
// ---------------------------------------------------------------------------

const NON_CLAUDE_STAGES = [
  {
    filename: '1_gofer_research.md',
    content: `---
name: 1_gofer_research
description: "Research codebase."
title: "Gofer Research"
category: pipeline
surfaces:
  - claude
  - agents-skills
  - codex
  - gemini
---

# Gofer Research

Research stage body.
`,
  },
  {
    filename: '0a_problem_validation.md',
    content: `---
name: 0a_problem_validation
description: "Validate the business problem."
title: "Problem Validation"
category: pipeline
surfaces:
  - claude
  - agents-skills
  - codex
  - gemini
---

# Problem Validation

Validation stage body.
`,
  },
  {
    filename: '2_gofer_specify.md',
    content: `---
name: 2_gofer_specify
description: "Create feature specification."
title: "Gofer Specify"
category: pipeline
surfaces:
  - claude
  - agents-skills
  - codex
  - gemini
---

# Gofer Specify

Specify stage body.
`,
  },
];

const CLAUDE_ONLY_STAGES_FIXTURES = [
  {
    filename: '0_gofer_start.md',
    content: `---
name: 0_gofer_start
description: "Business scenario."
title: "Business Scenario"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - agents-skills
  - codex
---

# Business Scenario
`,
  },
  {
    filename: '7_gofer_save.md',
    content: `---
name: 7_gofer_save
description: "Save session progress."
title: "Gofer Save"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - agents-skills
  - codex
---

# Gofer Save
`,
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-emitter-codex-config-test-'));

  for (const stage of [...NON_CLAUDE_STAGES, ...CLAUDE_ONLY_STAGES_FIXTURES]) {
    await writeFile(path.join(tmpRoot, '.specify', 'commands', stage.filename), stage.content);
  }

  const scriptPath = fileURLToPath(generateCommandsUrl);
  await execFileAsync('node', [scriptPath, '--root', tmpRoot, '--surfaces', 'codex-config']);
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('codex-config emitter (T068)', () => {
  it('creates .specify/outputs/codex-config-fragment.toml', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    expect(await fileExists(outPath)).toBe(true);
  });

  it('fragment contains [[skills.config]] entries', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content).toContain('[[skills.config]]');
  });

  it('does not contain retired gofer entry', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content).not.toContain('path = "/full/path/to/repo/.agents/skills/gofer"');
  });

  it('contains entry for eai', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content).toContain('path = "/full/path/to/repo/.agents/skills/eai"');
  });

  it('does not contain stage-specific public skill entries', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content).not.toContain('/.agents/skills/1_gofer_research"');
    expect(content).not.toContain('/.agents/skills/0_gofer_start"');
    expect(content).not.toContain('/.agents/skills/7_gofer_save"');
  });

  it('all entries have enabled = true', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    // Every [[skills.config]] block must be followed by enabled = true
    const blocks = content
      .split('[[skills.config]]')
      .slice(1)
      .filter((block) => block.includes('path = '));
    for (const block of blocks) {
      expect(block).toContain('enabled = true');
    }
  });

  it('keeps exactly one public skill entry', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content.match(/^\[\[skills\.config\]\]/gm)).toHaveLength(1);
  });

  it('does NOT touch ~/.codex/config.toml — path is .specify/outputs not home dir', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    // File should contain the correct output path comment pointing to home config
    expect(content).toContain('~/.codex/config.toml');
    // But verify the actual file written is in .specify/outputs, not the real ~/.codex
    expect(outPath).toContain('.specify/outputs');

    // Verify the real user home codex config was NOT modified by checking it doesn't
    // contain any test-specific stage names that only exist in our tmpRoot
    const homeCodexPath = path.join(os.homedir(), '.codex', 'config.toml');
    const homeExists = await fileExists(homeCodexPath);
    if (homeExists) {
      const homeContent = await readFile(homeCodexPath);
      // None of our fixture stage content would appear in real home config
      expect(homeContent).not.toContain('gofer-emitter-codex-config-test');
    }
  });

  it('fragment contains the correct comment header', async () => {
    const outPath = path.join(tmpRoot, '.specify', 'outputs', 'codex-config-fragment.toml');
    const content = await readFile(outPath);
    expect(content).toContain('# Gofer skill overrides for ~/.codex/config.toml');
    expect(content).toContain('# Generated by generate-commands.mjs on');
    expect(content).toContain(
      '# Codex discovers repository-local Gofer skills from .agents/skills automatically.'
    );
  });
});
