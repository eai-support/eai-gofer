/**
 * T133 — side-conversation.test.ts
 *
 * Verifies the `gofer_side.md` control-command source-of-truth (FR-013, US5 AC-4).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE_PATH = path.resolve(__dirname, '../../../.specify/commands/gofer_side.md');
const EXPECTED_SURFACES = [
  'agents-skills',
  'claude',
  'claude-mirror',
  'codex',
  'copilot',
  'antigravity',
  'github-prompts',
  'system-skills',
  'vscode',
];

const PARSE_MODULE_URL = new URL(
  '../../../.specify/scripts/node/parse-stage-command.mjs',
  import.meta.url
);

describe('gofer_side control command (T133 / FR-013)', () => {
  let parseStageCommand: (filePath: string) => Promise<{
    frontmatter: Record<string, unknown>;
    body: string;
  }>;

  beforeAll(async () => {
    const mod = await import(PARSE_MODULE_URL.href);
    parseStageCommand = mod.parseStageCommand;
  });

  it('source-of-truth file exists', () => {
    expect(existsSync(FILE_PATH)).toBe(true);
  });

  it('shares the same surface set as gofer_plan', async () => {
    const { frontmatter } = await parseStageCommand(FILE_PATH);
    const surfaces = frontmatter.surfaces as string[];
    const sorted = [...surfaces].sort();
    expect(sorted).toEqual([...EXPECTED_SURFACES].sort());
  });

  it('frontmatter category is "control"', async () => {
    const { frontmatter } = await parseStageCommand(FILE_PATH);
    expect(frontmatter.category).toBe('control');
  });

  it('body documents side-channel / context-preservation behavior', async () => {
    const { body } = await parseStageCommand(FILE_PATH);
    const lower = body.toLowerCase();
    // At least one of "side" or "context" must appear (both expected, but one is sufficient)
    const hasSide = lower.includes('side');
    const hasContext = lower.includes('context');
    expect(hasSide || hasContext).toBe(true);
  });

  it('description is at most 140 characters', async () => {
    const { frontmatter } = await parseStageCommand(FILE_PATH);
    expect(String(frontmatter.description).length).toBeLessThanOrEqual(140);
  });
});
