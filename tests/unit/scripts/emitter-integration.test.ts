/**
 * T044 — Integration test for generate-commands.mjs emitters.
 *
 * Creates a minimal temp workspace with .specify/commands/ stage files,
 * invokes the emitters, and verifies output file placement and content.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Module URL — mirrors the pattern used in other script tests
// ---------------------------------------------------------------------------

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
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A stage that should appear on all surfaces.
 */
const ALL_SURFACE_STAGE_CONTENT = `---
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
---

# Gofer Research

This is the research stage body content.

## Instructions

1. Analyse the codebase
2. Identify integration points
`;

/**
 * Formerly Claude-only stages now appear on all surfaces.
 */
const CLAUDE_ONLY_STAGE_CONTENT = `---
name: 0_gofer_start
description: "Define the business problem and scenario for Gofer to analyse and solve."
title: "Business Scenario"
category: pipeline
surfaces:
  - claude
  - claude-mirror
  - copilot
  - github-prompts
  - agents-skills
  - system-skills
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
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-emitter-test-'));

  // Write stage command source files
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '1_gofer_research.md'),
    ALL_SURFACE_STAGE_CONTENT
  );
  await writeFile(
    path.join(tmpRoot, '.specify', 'commands', '0_gofer_start.md'),
    CLAUDE_ONLY_STAGE_CONTENT
  );
});

afterAll(async () => {
  // Clean up temp directory
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generate-commands emitters (integration)', () => {
  let emitClaude: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let emitClaudeMirror: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let emitCopilot: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let emitGithubPrompts: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let emitAgentsSkills: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let emitSystemSkills: (stages: unknown[], root: string, dryRun: boolean) => Promise<boolean>;
  let shouldExclude: (stageName: string, surface: string) => boolean;
  let CLAUDE_ONLY_STAGES: string[];

  // We need to load all stages ourselves since the emitters expect parsed stage objects
  interface ParsedStage {
    filePath: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }
  let allStages: ParsedStage[];

  beforeAll(async () => {
    const mod = await import(generateCommandsUrl.href);
    shouldExclude = mod.shouldExclude;
    CLAUDE_ONLY_STAGES = mod.CLAUDE_ONLY_STAGES;

    // Load the emitters from the module by running the full pipeline via a
    // helper that calls loadStages + each emitter. Since emitters are not
    // exported, we drive them indirectly by invoking the module's internals
    // through the parse helper and building stage objects ourselves.

    const parseUrl = new URL(
      '../../../.specify/scripts/node/parse-stage-command.mjs',
      import.meta.url
    );
    const parseMod = await import(parseUrl.href);
    const parseStageCommand = parseMod.parseStageCommand as (
      filePath: string
    ) => Promise<{ frontmatter: Record<string, unknown>; body: string }>;

    const commandsDir = path.join(tmpRoot, '.specify', 'commands');
    const entries = await fs.readdir(commandsDir);
    allStages = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(commandsDir, entry);
      const parsed = await parseStageCommand(filePath);
      allStages.push({ filePath, ...parsed });
    }

    // Grab the individual emitter functions via a thin wrapper: we re-import
    // the module with a query param to bust any module cache, then extract the
    // private helpers by temporarily monkey-patching the module export.
    // Since the emitters aren't exported we drive the full test via a
    // separate dynamic import that does call main-equivalent logic.
    //
    // The cleanest approach given the current module shape: call each emitter
    // by reaching into a named re-export we add. If emitters are private,
    // we test them by exercising the full script programmatically below.
    //
    // For now, expose via the EMITTERS map if it's exported, or test through
    // the public shouldExclude + manual file assertions from calling node
    // generate-commands.mjs with --root.

    // We'll use child_process to invoke the script directly with --root
    // so we can verify real file output without needing internal exports.
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const scriptPath = fileURLToPath(generateCommandsUrl);
    await execFileAsync('node', [
      scriptPath,
      '--root',
      tmpRoot,
      '--surfaces',
      'claude,claude-mirror,copilot,github-prompts,agents-skills,system-skills,gemini,agents-md,codex-config',
    ]);

    // Assign dummy emitters for the describe blocks below — actual verification
    // is done via file-system assertions. We bind them so the symbols stay
    // referenced (and could be swapped for real exports without breaking
    // existing callers).
    emitClaude = async () => true;
    emitClaudeMirror = async () => true;
    emitCopilot = async () => true;
    emitGithubPrompts = async () => true;
    emitAgentsSkills = async () => true;
    emitSystemSkills = async () => true;
    void emitClaude;
    void emitClaudeMirror;
    void emitCopilot;
    void emitGithubPrompts;
    void emitAgentsSkills;
    void emitSystemSkills;
  });

  // -------------------------------------------------------------------------
  // shouldExclude unit tests (T043 pre-condition)
  // -------------------------------------------------------------------------

  describe('shouldExclude', () => {
    it('CLAUDE_ONLY_STAGES is empty', () => {
      expect(CLAUDE_ONLY_STAGES).toEqual([]);
    });

    it('does not exclude 0_gofer_start from copilot', () => {
      expect(shouldExclude('0_gofer_start', 'copilot')).toBe(false);
    });

    it('does not exclude 0_gofer_start from github-prompts', () => {
      expect(shouldExclude('0_gofer_start', 'github-prompts')).toBe(false);
    });

    it('does not exclude 0_gofer_start from agents-skills', () => {
      expect(shouldExclude('0_gofer_start', 'agents-skills')).toBe(false);
    });

    it('does not exclude 0_gofer_start from system-skills', () => {
      expect(shouldExclude('0_gofer_start', 'system-skills')).toBe(false);
    });

    it('does NOT exclude 0_gofer_start from claude', () => {
      expect(shouldExclude('0_gofer_start', 'claude')).toBe(false);
    });

    it('does NOT exclude 0_gofer_start from claude-mirror', () => {
      expect(shouldExclude('0_gofer_start', 'claude-mirror')).toBe(false);
    });

    it('does NOT exclude 1_gofer_research from any surface', () => {
      const surfaces = [
        'claude',
        'claude-mirror',
        'copilot',
        'github-prompts',
        'agents-skills',
        'system-skills',
        'gemini',
        'codex',
      ];
      for (const surface of surfaces) {
        expect(shouldExclude('1_gofer_research', surface)).toBe(false);
      }
    });

    it('does not exclude legacy stages from codex', () => {
      for (const stage of CLAUDE_ONLY_STAGES) {
        expect(shouldExclude(stage, 'codex')).toBe(false);
      }
    });

    it('does not exclude legacy stages from gemini', () => {
      for (const stage of CLAUDE_ONLY_STAGES) {
        expect(shouldExclude(stage, 'gemini')).toBe(false);
      }
    });
  });

  describe('public command emitters', () => {
    it('emits only gofer and eai to Claude command folders', async () => {
      expect(await fileExists(path.join(tmpRoot, '.claude', 'commands', 'gofer.md'))).toBe(true);
      expect(await fileExists(path.join(tmpRoot, '.claude', 'commands', 'eai.md'))).toBe(true);
      expect(
        await fileExists(path.join(tmpRoot, '.claude', 'commands', '1_gofer_research.md'))
      ).toBe(false);
      expect(await fileExists(path.join(tmpRoot, '.claude', 'commands', '0_gofer_start.md'))).toBe(
        false
      );
    });

    it('mirrors the same public commands into extension resources', async () => {
      const mirrorPath = path.join(tmpRoot, 'extension', 'resources', 'claude-commands');
      expect(await fileExists(path.join(mirrorPath, 'gofer.md'))).toBe(true);
      expect(await fileExists(path.join(mirrorPath, 'eai.md'))).toBe(true);
      expect(await fileExists(path.join(mirrorPath, '1_gofer_research.md'))).toBe(false);
    });

    it('public Claude command routes through internal stage contracts', async () => {
      const content = await readFile(path.join(tmpRoot, '.claude', 'commands', 'gofer.md'));
      expect(content).toContain('# Gofer');
      expect(content).toContain('## User-Facing Contract');
      expect(content).toContain('.specify/commands/*.md');
      expect(content).toContain('0_gofer_start');
      expect(content).toContain('1_gofer_research');
      expect(content).not.toContain('name: 1_gofer_research');
    });

    it('emits only public Copilot prompts with metadata-rich frontmatter', async () => {
      const promptsPath = path.join(tmpRoot, 'extension', 'resources', 'copilot-prompts');
      const content = await readFile(path.join(promptsPath, 'gofer.prompt.md'));
      expect(content).toContain('name: gofer');
      expect(content).toContain('agent: agent');
      expect(content).not.toContain('agent: copilot-workspace');
      expect(content).toContain('publicEntrypoint: true');
      expect(content).toContain('canonicalSource: .specify/commands/0_gofer_start.md');
      expect(await fileExists(path.join(promptsPath, '1_gofer_research.prompt.md'))).toBe(false);
    });

    it('emits only public GitHub prompt files', async () => {
      const promptsPath = path.join(tmpRoot, '.github', 'prompts');
      expect(await fileExists(path.join(promptsPath, 'gofer.prompt.md'))).toBe(true);
      expect(await fileExists(path.join(promptsPath, 'eai.prompt.md'))).toBe(true);
      expect(await fileExists(path.join(promptsPath, '1_gofer_research.prompt.md'))).toBe(false);
    });

    it('emits only public Codex skills', async () => {
      const skillsPath = path.join(tmpRoot, '.agents', 'skills');
      const content = await readFile(path.join(skillsPath, 'gofer', 'SKILL.md'));
      expect(content).toContain('name: gofer');
      expect(content).toContain('## User-Facing Contract');
      expect(await fileExists(path.join(skillsPath, '1_gofer_research', 'SKILL.md'))).toBe(false);
      expect(await fileExists(path.join(skillsPath, '0_gofer_start', 'SKILL.md'))).toBe(false);
    });

    it('emits only public compatibility skills', async () => {
      const skillsPath = path.join(tmpRoot, '.system', 'skills');
      expect(await fileExists(path.join(skillsPath, 'gofer', 'SKILL.md'))).toBe(true);
      expect(await fileExists(path.join(skillsPath, 'eai', 'SKILL.md'))).toBe(true);
      expect(await fileExists(path.join(skillsPath, '1_gofer_research', 'SKILL.md'))).toBe(false);
    });
  });

  describe('surface parity (T043)', () => {
    it('public entrypoints appear on all user-visible surfaces', async () => {
      const expectedPaths = [
        path.join(tmpRoot, '.claude', 'commands', 'gofer.md'),
        path.join(tmpRoot, '.claude', 'commands', 'eai.md'),
        path.join(tmpRoot, 'extension', 'resources', 'claude-commands', 'gofer.md'),
        path.join(tmpRoot, 'extension', 'resources', 'copilot-prompts', 'gofer.prompt.md'),
        path.join(tmpRoot, '.github', 'prompts', 'gofer.prompt.md'),
        path.join(tmpRoot, '.agents', 'skills', 'gofer', 'SKILL.md'),
        path.join(tmpRoot, '.system', 'skills', 'gofer', 'SKILL.md'),
        path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'gofer.toml'),
        path.join(tmpRoot, '.gemini', 'commands', 'gofer', 'eai.toml'),
      ];

      for (const outPath of expectedPaths) {
        expect(await fileExists(outPath), `public entrypoint should exist at: ${outPath}`).toBe(
          true
        );
      }
    });

    it('internal stage contracts remain canonical in .specify/commands only', async () => {
      expect(await fileExists(path.join(tmpRoot, '.specify', 'commands', '0_gofer_start.md'))).toBe(
        true
      );
      expect(
        await fileExists(path.join(tmpRoot, '.specify', 'commands', '1_gofer_research.md'))
      ).toBe(true);
    });
  });
});
