/**
 * T163 — Codex clean-environment smoke.
 *
 * Verifies that Codex can pick up Gofer commands without budget warning:
 *   1. codex-doctor.mjs against a clean fixture exits 0
 *   2. Cumulative byte total ≤ 2048 bytes for canonical Gofer descriptions
 *   3. No budget warnings raised
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  CANONICAL_DESCRIPTIONS,
  validateDescriptions,
} from '../../../.specify/scripts/node/canonical-descriptions.mjs';
import { CANONICAL_DESCRIPTION_COUNT } from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCTOR_PATH = path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'codex-doctor.mjs');

const CLAUDE_ONLY_STAGES = new Set<string>([
  '0_gofer_start',
  'gofer_constitution',
  'gofer_hydrate',
  '7_gofer_save',
  '8_gofer_branding',
]);

let cleanRoot: string;

beforeAll((): void => {
  cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-clean-'));
  // Build ONE canonical Gofer bundle, full 16-stage shape so the bundle
  // detector (≥12-of-16 threshold) classifies it as a Gofer bundle.
  // In the actual published install the 5 claude-only stages are absent
  // (FR-007); we keep them here purely so the bundle detector fires.
  const tenantDir = path.join(cleanRoot, 'gofer');
  for (const [name, description] of Object.entries(CANONICAL_DESCRIPTIONS)) {
    const stageDir = path.join(tenantDir, name);
    fs.mkdirSync(stageDir, { recursive: true });
    const skill = `---\nname: ${name}\ndescription: ${description}\n---\n\nbody.\n`;
    fs.writeFileSync(path.join(stageDir, 'SKILL.md'), skill);
  }
});

afterAll((): void => {
  fs.rmSync(cleanRoot, { recursive: true, force: true });
});

describe('codex clean environment smoke (T163)', () => {
  it('canonical descriptions validate (≤140 chars each, ≤2048 bytes total)', (): void => {
    const { count, totalBytes } = validateDescriptions();
    expect(count).toBe(CANONICAL_DESCRIPTION_COUNT);
    expect(totalBytes).toBeLessThanOrEqual(2048);
  });

  it('cumulative bytes for non-claude-only stages ≤ 2048', (): void => {
    let total = 0;
    for (const [name, description] of Object.entries(CANONICAL_DESCRIPTIONS)) {
      if (CLAUDE_ONLY_STAGES.has(name)) continue;
      total += Buffer.byteLength(description, 'utf8');
    }
    expect(total).toBeLessThanOrEqual(2048);
  });

  it('codex-doctor exits 0 against clean canonical fixture', (): void => {
    const stdout = execFileSync('node', [DOCTOR_PATH, '--root', cleanRoot, '--format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const report = JSON.parse(stdout);
    expect(report.warnings).toEqual([]);
    expect(report.descriptionBudgetBytes).toBeLessThanOrEqual(2048);
  });

  it('doctor report contains exactly 1 canonical Gofer bundle', (): void => {
    const stdout = execFileSync('node', [DOCTOR_PATH, '--root', cleanRoot, '--format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const report = JSON.parse(stdout);
    expect(report.goferBundles.length).toBe(1);
    expect(report.goferBundles[0].isDuplicate).toBe(false);
  });
});
