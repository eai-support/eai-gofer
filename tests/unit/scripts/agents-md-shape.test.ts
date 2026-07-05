/**
 * T168 — Validates AGENTS.md (at repo root) shape.
 *
 *   1. Exists
 *   2. Contains the core + helper stage sections
 *   3. Lists the full Gofer command set (one ### per command across both)
 *   4. Each description ≤140 chars
 *   5. Formerly Claude-only stages are listed in the helper-aware sections
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_COMMAND_COUNT, FULL_COMMAND_NAMES } from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const AGENTS_MD_PATH = path.join(REPO_ROOT, 'AGENTS.md');

function extractStageSections(content: string): string {
  const coreStart = content.indexOf('## Core Pipeline Stages');
  const helperStart = content.indexOf('## Optional Helper Commands');
  if (coreStart === -1 && helperStart === -1) return '';

  const start = coreStart !== -1 ? coreStart : helperStart;
  const after = content.slice(start);
  const nextSectionRel = after
    .slice(3)
    .search(/\n## (?!Core Pipeline Stages|Optional Helper Commands)/);
  return nextSectionRel === -1 ? after : after.slice(0, nextSectionRel + 3);
}

describe('AGENTS.md shape (T168)', () => {
  it('AGENTS.md exists at repo root', (): void => {
    expect(fs.existsSync(AGENTS_MD_PATH)).toBe(true);
  });

  it('contains the core and helper stage sections', (): void => {
    const content = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
    expect(content).toContain('## Core Pipeline Stages');
    expect(content).toContain('## Optional Helper Commands');
  });

  it(`lists exactly ${FULL_COMMAND_COUNT} Gofer stage/helper subsections (### <name>)`, (): void => {
    const content = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
    const section = extractStageSections(content);
    let foundCount = 0;
    for (const stage of FULL_COMMAND_NAMES) {
      const re = new RegExp(`^### ${stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm');
      if (re.test(section)) foundCount++;
    }
    expect(foundCount).toBe(FULL_COMMAND_COUNT);
  });

  it('each stage description in stages section is ≤140 chars', (): void => {
    const content = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
    const section = extractStageSections(content);
    // Find paragraphs immediately after each `### <name>` heading.
    const blocks = section.split(/^### /m).slice(1);
    for (const block of blocks) {
      const lines = block.split('\n');
      // First line is the stage name, second blank, third is the description.
      const descLine = lines[2] ?? '';
      if (descLine.trim() === '') continue; // tolerate blank-line variations
      expect(
        descLine.length,
        `description "${descLine.slice(0, 60)}..." exceeds 140 chars`
      ).toBeLessThanOrEqual(140);
    }
  });

  it('formerly Claude-only stages are listed in the helper-aware sections', (): void => {
    const content = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
    const section = extractStageSections(content);
    for (const stage of [
      '0_gofer_start',
      'gofer_constitution',
      'gofer_hydrate',
      '7_gofer_save',
      '8_gofer_branding',
    ]) {
      const re = new RegExp(`^### ${stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm');
      expect(re.test(section), `stage '${stage}' must appear as a ### heading`).toBe(true);
    }
  });
});
