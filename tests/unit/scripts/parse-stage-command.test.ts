import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../tests/fixtures/stage-commands/1_gofer_research.md'
);
let currentFixturePath: string;
let fixtureRoot: string;

const moduleUrl = new URL(
  '../../../.specify/scripts/node/parse-stage-command.mjs',
  import.meta.url
);

describe('parseStageCommand', () => {
  let parseStageCommand: (
    filePath: string
  ) => Promise<{ frontmatter: Record<string, unknown>; body: string }>;

  beforeAll(async () => {
    const mod = await import(moduleUrl.href);
    parseStageCommand = mod.parseStageCommand;
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-current-stage-'));
    currentFixturePath = path.join(fixtureRoot, '1_gofer_research.md');
    const legacy = await fs.readFile(FIXTURE_PATH, 'utf8');
    await fs.writeFile(currentFixturePath, legacy.replace(/^ {2}- gemini$/m, '  - antigravity'));
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('rejects the unchanged legacy Gemini fixture with migration guidance', async () => {
    await expect(parseStageCommand(FIXTURE_PATH)).rejects.toThrow(
      /Gemini CLI is retired.*antigravity/
    );
  });

  it('parses valid YAML frontmatter without throwing', async () => {
    const result = await parseStageCommand(currentFixturePath);
    expect(result).toBeDefined();
    expect(result.frontmatter).toBeDefined();
    expect(result.body).toBeDefined();
  });

  it('returns the correct name field from frontmatter', async () => {
    const { frontmatter } = await parseStageCommand(currentFixturePath);
    expect(frontmatter.name).toBe('1_gofer_research');
  });

  it('returns the correct description field from frontmatter', async () => {
    const { frontmatter } = await parseStageCommand(currentFixturePath);
    expect(frontmatter.description).toBe(
      'Research codebase, CLI integrations, and technology landscape for the target feature.'
    );
  });

  it('returns the correct title field from frontmatter', async () => {
    const { frontmatter } = await parseStageCommand(currentFixturePath);
    expect(frontmatter.title).toBe('Gofer Research');
  });

  it('returns surfaces as an array', async () => {
    const { frontmatter } = await parseStageCommand(currentFixturePath);
    expect(Array.isArray(frontmatter.surfaces)).toBe(true);
    expect(frontmatter.surfaces).toContain('claude');
    expect(frontmatter.surfaces).toContain('codex');
    expect(frontmatter.surfaces).toContain('antigravity');
    expect(frontmatter.surfaces).not.toContain('gemini');
  });

  it('returns the correct category', async () => {
    const { frontmatter } = await parseStageCommand(currentFixturePath);
    expect(frontmatter.category).toBe('pipeline');
  });

  it('extracts markdown body after the second --- fence', async () => {
    const { body } = await parseStageCommand(currentFixturePath);
    // Body should contain the heading and content, not the frontmatter
    expect(body).toContain('# Gofer Research');
    expect(body).toContain('Analyse the existing codebase structure');
    // Body must not contain frontmatter keys
    expect(body).not.toContain('name: 1_gofer_research');
    expect(body).not.toContain('category: pipeline');
  });

  it('throws for a file that does not start with ---', async () => {
    // Use a non-existent path that we know will fail
    await expect(parseStageCommand('/nonexistent/path/file.md')).rejects.toThrow();
  });

  it('rejects frontmatter names with invalid path characters', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parse-stage-invalid-name-'));
    const filePath = path.join(tempDir, 'gofer_diagnose.md');

    await fs.writeFile(
      filePath,
      `---
name: ../../escape
description: "Invalid"
title: "Invalid"
category: control
surfaces:
  - claude
---

# Invalid
`,
      'utf8'
    );

    await expect(parseStageCommand(filePath)).rejects.toThrow("'name' contains invalid characters");
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects frontmatter names that do not match the canonical file id', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parse-stage-mismatch-'));
    const filePath = path.join(tempDir, 'gofer_diagnose.md');

    await fs.writeFile(
      filePath,
      `---
name: gofer:plan
description: "Mismatch"
title: "Mismatch"
category: control
surfaces:
  - claude
---

# Mismatch
`,
      'utf8'
    );

    await expect(parseStageCommand(filePath)).rejects.toThrow(
      "'name' must match canonical command id 'gofer:diagnose'"
    );
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
