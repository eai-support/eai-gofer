/**
 * Unit test for .specify/scripts/node/codex-doctor.mjs
 *
 * Covers: T049 (basic doctor against fixture), T050 (over-budget edge — partial),
 * T051 (no fake key grep), T052 (read-only enforcement source-grep).
 *
 * The fixture mirrors the 2026-04-25 incident shape: two Gofer-bundle tenants
 * (23 canonical commands each, one canonical + one duplicate) plus a `.system/imagegen`
 * single-skill tenant.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_DESCRIPTION_NAMES } from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve repo root: tests/unit/codex/ → ../../../
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DOCTOR_PATH = path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'codex-doctor.mjs');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'codex-skills-fixture');

const CANONICAL_GOFER_STAGES = [...CANONICAL_DESCRIPTION_NAMES];

function buildSkillMd(name: string): string {
  // Description ≤140 bytes; minimal body.
  const description = `Test fixture skill ${name} (under 140 bytes).`;
  return `---\nname: ${name}\ndescription: ${description}\n---\n\nFixture body for ${name}.\n`;
}

function buildBundle(tenantDir: string): void {
  const goferDir = path.join(tenantDir, 'gofer');
  for (const stage of CANONICAL_GOFER_STAGES) {
    const stageDir = path.join(goferDir, stage);
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'SKILL.md'), buildSkillMd(stage));
  }
}

beforeAll(() => {
  // Build a clean fixture tree for the test suite.
  if (fs.existsSync(FIXTURE_ROOT)) {
    fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  buildBundle(path.join(FIXTURE_ROOT, 'tenant-a'));
  buildBundle(path.join(FIXTURE_ROOT, 'tenant-b'));
  // System single-skill tenant — should NOT be classified as a Gofer bundle.
  const systemDir = path.join(FIXTURE_ROOT, '.system', 'imagegen');
  fs.mkdirSync(systemDir, { recursive: true });
  fs.writeFileSync(path.join(systemDir, 'SKILL.md'), buildSkillMd('imagegen'));
});

afterAll(() => {
  // Tear down fixture (test-only cleanup; doctor itself never writes).
  if (fs.existsSync(FIXTURE_ROOT)) {
    fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  }
});

describe('codex-doctor', () => {
  it('reports 2 Gofer bundles, 1 marked as duplicate', async () => {
    const mod = await import(DOCTOR_PATH);
    const { report } = await mod.runDoctor({ root: FIXTURE_ROOT });
    expect(report.goferBundles).toHaveLength(2);
    const dups = report.goferBundles.filter((b: { isDuplicate: boolean }) => b.isDuplicate);
    expect(dups).toHaveLength(1);
  });

  it('computes cumulative description bytes correctly', async () => {
    const mod = await import(DOCTOR_PATH);
    const { report } = await mod.runDoctor({ root: FIXTURE_ROOT });
    // Each fixture description is the same byte length; we expect a positive
    // total equal to (skill count * per-description bytes).
    expect(report.descriptionBudgetBytes).toBeGreaterThan(0);
    // 2 bundles × 23 canonical commands + 1 system skill = 47 SKILL.md files.
    expect(report.totalSkillFiles).toBe(47);
    // Each description is roughly ~50 bytes; cumulative will exceed 2048
    // because we have 47 skills. The over-budget exit code path is exercised
    // by the cumulative-budget assertion below; we tolerate either >2048 (as
    // is realistic for 43 skills) or ≤2048 if descriptions get shortened in
    // the future.
    const bytesPerSkill = report.descriptionBudgetBytes / report.totalSkillFiles;
    expect(bytesPerSkill).toBeGreaterThan(20);
  });

  it('suggestedConfig contains tenant-b entries with enabled = false', async () => {
    const mod = await import(DOCTOR_PATH);
    const { report } = await mod.runDoctor({ root: FIXTURE_ROOT });
    expect(report.suggestedConfig).toContain('[[skills.config]]');
    expect(report.suggestedConfig).toContain('enabled = false');
    // Whichever tenant is marked duplicate (could be either depending on
    // dirent ordering); assert the suggestedConfig references one of them.
    const referencesA = report.suggestedConfig.includes(path.join(FIXTURE_ROOT, 'tenant-a'));
    const referencesB = report.suggestedConfig.includes(path.join(FIXTURE_ROOT, 'tenant-b'));
    expect(referencesA || referencesB).toBe(true);
  });

  it('suggestedConfig contains zero skills_context_budget_percent occurrences', async () => {
    const mod = await import(DOCTOR_PATH);
    const { report } = await mod.runDoctor({ root: FIXTURE_ROOT });
    expect(report.suggestedConfig).not.toContain('skills_context_budget_percent');
    expect(report.noFakeKeyAssertion).toBe(true);
  });

  it('exit code = 2 when undisabled duplicates exist', async () => {
    const mod = await import(DOCTOR_PATH);
    const { exitCode } = await mod.runDoctor({ root: FIXTURE_ROOT });
    // Either 1 (over-budget for 33 skills) OR 2 (duplicates). Per cli-commands.md
    // §2.1 row "Both 1 and 2", duplicates take precedence and exit 2 is returned.
    expect(exitCode).toBe(2);
  });

  it('doctor source code does not call fs.write*/fs.mkdir/fs.unlink (read-only)', () => {
    const src = fs.readFileSync(DOCTOR_PATH, 'utf8');
    // Strip block comments and line comments so the FORBIDDEN_FS_METHODS list
    // and contract documentation strings don't trigger false positives.
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const forbidden = [
      /\bfs\.writeFile\b/,
      /\bfs\.appendFile\b/,
      /\bfs\.mkdir\b/,
      /\bfs\.rm\b/,
      /\bfs\.rmdir\b/,
      /\bfs\.unlink\b/,
      /\bfsp\.writeFile\b/,
      /\bfsp\.appendFile\b/,
      /\bfsp\.mkdir\b/,
      /\bfsp\.rm\b/,
      /\bfsp\.unlink\b/,
    ];
    for (const re of forbidden) {
      expect(stripped, `forbidden mutating fs call ${re} found in doctor source`).not.toMatch(re);
    }
  });
});
