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

  // -------------------------------------------------------------------------
  // T037 — claude emitter output
  // -------------------------------------------------------------------------

  describe('claude emitter (T037)', () => {
    it('emits 1_gofer_research.md to .claude/commands/', async () => {
      const outPath = path.join(tmpRoot, '.claude', 'commands', '1_gofer_research.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits 0_gofer_start.md to .claude/commands/ (claude-only stage IS allowed on claude)', async () => {
      const outPath = path.join(tmpRoot, '.claude', 'commands', '0_gofer_start.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('body content is written without frontmatter', async () => {
      const outPath = path.join(tmpRoot, '.claude', 'commands', '1_gofer_research.md');
      const content = await readFile(outPath);
      expect(content).toContain('# Gofer Research');
      expect(content).toContain('This is the research stage body content.');
      expect(content).not.toContain('name: 1_gofer_research');
      expect(content).not.toContain('category: pipeline');
    });
  });

  // -------------------------------------------------------------------------
  // T038 — claude-mirror emitter output
  // -------------------------------------------------------------------------

  describe('claude-mirror emitter (T038)', () => {
    it('emits 1_gofer_research.md to extension/resources/claude-commands/', async () => {
      const outPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'claude-commands',
        '1_gofer_research.md'
      );
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits 0_gofer_start.md to extension/resources/claude-commands/ (allowed on claude-mirror)', async () => {
      const outPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'claude-commands',
        '0_gofer_start.md'
      );
      expect(await fileExists(outPath)).toBe(true);
    });

    it('body content matches claude output', async () => {
      const claudePath = path.join(tmpRoot, '.claude', 'commands', '1_gofer_research.md');
      const mirrorPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'claude-commands',
        '1_gofer_research.md'
      );
      const claudeContent = await readFile(claudePath);
      const mirrorContent = await readFile(mirrorPath);
      expect(mirrorContent).toBe(claudeContent);
    });
  });

  // -------------------------------------------------------------------------
  // T039 — copilot emitter output
  // -------------------------------------------------------------------------

  describe('copilot emitter (T039)', () => {
    it('emits 1_gofer_research.prompt.md to extension/resources/copilot-prompts/', async () => {
      const outPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'copilot-prompts',
        '1_gofer_research.prompt.md'
      );
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits 0_gofer_start to copilot-prompts/', async () => {
      const outPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'copilot-prompts',
        '0_gofer_start.prompt.md'
      );
      expect(await fileExists(outPath)).toBe(true);
    });

    it('copilot prompt includes metadata-rich frontmatter', async () => {
      const outPath = path.join(
        tmpRoot,
        'extension',
        'resources',
        'copilot-prompts',
        '1_gofer_research.prompt.md'
      );
      const content = await readFile(outPath);
      expect(content).toContain('# Gofer Research');
      expect(content).toContain('name: 1_gofer_research');
      expect(content).toContain('agent: copilot-workspace');
      expect(content).toContain('gofer:');
      expect(content).toContain('workflowProfile: standard');
      expect(content).toContain('canonicalSource: .specify/commands/1_gofer_research.md');
    });
  });

  // -------------------------------------------------------------------------
  // T040 — github-prompts emitter output
  // -------------------------------------------------------------------------

  describe('github-prompts emitter (T040)', () => {
    it('emits 1_gofer_research.prompt.md to .github/prompts/', async () => {
      const outPath = path.join(tmpRoot, '.github', 'prompts', '1_gofer_research.prompt.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits 0_gofer_start to .github/prompts/', async () => {
      const outPath = path.join(tmpRoot, '.github', 'prompts', '0_gofer_start.prompt.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('github-prompts prompt includes metadata-rich frontmatter', async () => {
      const outPath = path.join(tmpRoot, '.github', 'prompts', '1_gofer_research.prompt.md');
      const content = await readFile(outPath);
      expect(content).toContain('# Gofer Research');
      expect(content).toContain('name: 1_gofer_research');
      expect(content).toContain('agent: copilot-workspace');
      expect(content).toContain('gofer:');
      expect(content).toContain('workflowProfile: standard');
      expect(content).toContain('canonicalSource: .specify/commands/1_gofer_research.md');
    });
  });

  // -------------------------------------------------------------------------
  // T041 — agents-skills emitter output
  // -------------------------------------------------------------------------

  describe('agents-skills emitter (T041)', () => {
    it('emits SKILL.md to .agents/skills/1_gofer_research/', async () => {
      const outPath = path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits SKILL.md for 0_gofer_start', async () => {
      const outPath = path.join(tmpRoot, '.agents', 'skills', '0_gofer_start', 'SKILL.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('SKILL.md contains correct YAML frontmatter with name and description', async () => {
      const outPath = path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md');
      const content = await readFile(outPath);
      expect(content).toContain('name: 1_gofer_research');
      expect(content).toContain(
        'description: "Research codebase, CLI integrations, and technology landscape for the target feature."'
      );
    });

    it('SKILL.md contains the stage body after frontmatter', async () => {
      const outPath = path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md');
      const content = await readFile(outPath);
      expect(content).toContain('# Gofer Research');
      expect(content).toContain('This is the research stage body content.');
    });

    it('SKILL.md starts with --- fence', async () => {
      const outPath = path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md');
      const content = await readFile(outPath);
      expect(content.startsWith('---')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // T042 — system-skills emitter output
  // -------------------------------------------------------------------------

  describe('system-skills emitter (T042)', () => {
    it('emits SKILL.md to .system/skills/1_gofer_research/', async () => {
      const outPath = path.join(tmpRoot, '.system', 'skills', '1_gofer_research', 'SKILL.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('emits SKILL.md for 0_gofer_start', async () => {
      const outPath = path.join(tmpRoot, '.system', 'skills', '0_gofer_start', 'SKILL.md');
      expect(await fileExists(outPath)).toBe(true);
    });

    it('system SKILL.md has same format as agents SKILL.md', async () => {
      const agentsPath = path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md');
      const systemPath = path.join(tmpRoot, '.system', 'skills', '1_gofer_research', 'SKILL.md');
      const agentsContent = await readFile(agentsPath);
      const systemContent = await readFile(systemPath);
      expect(systemContent).toBe(agentsContent);
    });

    it('SKILL.md description field is within 140 chars', async () => {
      const outPath = path.join(tmpRoot, '.system', 'skills', '1_gofer_research', 'SKILL.md');
      const content = await readFile(outPath);
      const match = content.match(/description: "(.+)"/);
      expect(match).not.toBeNull();
      expect(match![1].length).toBeLessThanOrEqual(140);
    });
  });

  // -------------------------------------------------------------------------
  // T043 — per-CLI parity cross-check
  // -------------------------------------------------------------------------

  describe('surface parity (T043)', () => {
    it('formerly Claude-only stages are present on all portable surfaces', async () => {
      const formerlyClaudeOnlyStages = ['0_gofer_start'];
      const portableSurfaces = [
        {
          surface: 'copilot',
          dir: path.join(tmpRoot, 'extension', 'resources', 'copilot-prompts'),
          ext: '.prompt.md',
        },
        {
          surface: 'github-prompts',
          dir: path.join(tmpRoot, '.github', 'prompts'),
          ext: '.prompt.md',
        },
        {
          surface: 'agents-skills',
          dir: path.join(tmpRoot, '.agents', 'skills'),
          ext: '/SKILL.md',
          nested: true,
        },
        {
          surface: 'system-skills',
          dir: path.join(tmpRoot, '.system', 'skills'),
          ext: '/SKILL.md',
          nested: true,
        },
        {
          surface: 'gemini',
          dir: path.join(tmpRoot, '.gemini', 'commands', 'gofer'),
          ext: '.toml',
        },
      ];

      for (const stage of formerlyClaudeOnlyStages) {
        for (const { surface, dir, ext, nested } of portableSurfaces) {
          const outPath = nested
            ? path.join(dir, stage, 'SKILL.md')
            : path.join(dir, `${stage}${ext}`);
          const exists = await fileExists(outPath);
          expect(exists, `stage '${stage}' should exist at ${surface} path: ${outPath}`).toBe(true);
        }
      }
    });

    it('all-surface stage 1_gofer_research appears in all surfaces', async () => {
      const expectedPaths = [
        path.join(tmpRoot, '.claude', 'commands', '1_gofer_research.md'),
        path.join(tmpRoot, 'extension', 'resources', 'claude-commands', '1_gofer_research.md'),
        path.join(
          tmpRoot,
          'extension',
          'resources',
          'copilot-prompts',
          '1_gofer_research.prompt.md'
        ),
        path.join(tmpRoot, '.github', 'prompts', '1_gofer_research.prompt.md'),
        path.join(tmpRoot, '.agents', 'skills', '1_gofer_research', 'SKILL.md'),
        path.join(tmpRoot, '.system', 'skills', '1_gofer_research', 'SKILL.md'),
        path.join(tmpRoot, '.gemini', 'commands', 'gofer', '1_gofer_research.toml'),
      ];

      for (const outPath of expectedPaths) {
        expect(await fileExists(outPath), `1_gofer_research should exist at: ${outPath}`).toBe(
          true
        );
      }
    });
  });
});
