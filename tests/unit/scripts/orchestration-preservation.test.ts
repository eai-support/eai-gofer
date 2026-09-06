import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string) => readFile(path.join(root, file), 'utf8');

describe('portable orchestration preservation', () => {
  it('keeps the frozen functions, settings, protected code and shipped contracts', async () => {
    const url = new URL('../../../scripts/verify-orchestration-preservation.mjs', import.meta.url);
    const { verifyOrchestrationPreservation } = await import(url.href);
    const result = await verifyOrchestrationPreservation();
    expect(result.preservedStages).toBe(26);
    expect(result.protectedContracts).toBe(11);
    expect(result.approvedMigrations).toBe(3);
    expect(result.migratedEntrypoints).toBe(24);
    expect(result.liveHostExecution).toContain('not tested');
  });

  it('uses symbolic model tiers without removing delegate roles', async () => {
    const files = await readdir(path.join(root, '.specify/commands'));
    for (const file of files.filter((file) => file.endsWith('.md'))) {
      expect(await read(`.specify/commands/${file}`), file).not.toMatch(
        /model="(?:haiku|sonnet|opus)"/
      );
    }
    const implement = await read('.specify/commands/5_gofer_implement.md');
    expect(implement).toContain('subagent_type="implement-variant-generator", model_tier="medium"');
    expect(implement).toContain('subagent_type="multi-perspective-judge", model_tier="arbiter"');
  });

  it('ships the approved native migration without losing product boundaries', async () => {
    for (const file of [
      '.agents/skills/eai-update/SKILL.md',
      '.claude/commands/eai-update.md',
      '.github/prompts/eai-update.prompt.md',
      'plugins/antigravity/eai-gofer/skills/eai-update/SKILL.md',
      'skills/eai-update/SKILL.md',
      'plugins/eai-gofer/skills/eai-update/SKILL.md',
    ]) {
      const content = await read(file);
      expect(content, file).toContain('antigravity-desktop');
      expect(content, file).toContain('Gemini CLI is retired');
      expect(content, file).toContain('GEMINI.md');
    }
    const guide = await read('.specify/references/portable-orchestration.md');
    expect(guide).toContain('CLI, desktop and IDE access need separate evidence');
    expect(guide).toContain('Gemini CLI is');
    expect(guide).toContain('Preserve unrelated legacy settings');
  });

  it('preserves Grok repo skills and corrects obsolete native plugin claims', async () => {
    for (const base of ['', 'extension/resources/', 'plugins/eai-gofer/']) {
      const skillRoot =
        base === 'extension/resources/' ? `${base}grok-skills` : `${base}.grok/skills`;
      const entry = await read(`${skillRoot}/eai/SKILL.md`);
      expect(entry).toContain('Host: Grok Build');
      expect(entry).toContain('--host grok --json');
      expect(entry).toContain('portable-orchestration.md');
      const update = await read(`${skillRoot}/eai-update/SKILL.md`);
      expect(update).toContain('now supports native plugins');
      expect(update).toContain(
        'node <resolved-gofer-root>/.specify/scripts/node/gofer-surface-update.mjs --action inspect --host grok --json'
      );
      expect(update).toContain('Install/update actions remain blocked');
      expect(update).toContain('Grok Bot desktop is a separate target');
      expect(update).not.toContain('has no supported user-level plugin');
    }
    const reference = await read('.specify/references/portable-orchestration.md');
    expect(reference).toContain('no model picker');
    expect(reference).toContain('not separate security boundaries');
    expect(reference).toContain('allowed-tools');
  });

  it('bounds shared prompt growth and keeps only the current public entries', async () => {
    const url = new URL(
      '../../../.specify/scripts/node/lib/orchestration-contract.mjs',
      import.meta.url
    );
    const { buildPortableOrchestrationContract } = await import(url.href);
    expect(Buffer.byteLength(buildPortableOrchestrationContract())).toBeLessThan(800);
    const directories = [
      '.agents/skills',
      '.system/skills',
      '.grok/skills',
      'plugins/eai-gofer/skills',
    ];
    for (const directory of directories) {
      const entries = (await readdir(path.join(root, directory))).filter(
        (entry) => !entry.startsWith('.') && entry !== 'gofer-documentation'
      );
      expect(entries.sort(), directory).toEqual(['eai', 'eai-update']);
    }
  });

  it('adds release validation without weakening existing checks', async () => {
    const release = await read('release.sh');
    expect(release).toContain('gofer:orchestration:check');
    for (const command of [
      'npm run test:unit',
      'npm --prefix extension test',
      'gofer:surface-release:check',
    ]) {
      expect(release).toContain(command);
    }
    const workflow = await read('.github/workflows/portable-orchestration.yml');
    for (const runner of ['ubuntu-latest', 'windows-latest', 'macos-latest'])
      expect(workflow).toContain(runner);
    expect(await read('.github/workflows/release.yml')).toContain('gofer:orchestration:check');
    const scripts = JSON.parse(await read('package.json')).scripts;
    for (const file of [
      'tests/unit/scripts/model-discovery.test.ts',
      'tests/unit/config/modelPolicy.test.ts',
      'tests/unit/council/providers/cli/CLIModelSelection.test.ts',
      'tests/unit/council/providers/cli/CLIModelDiscovery.test.ts',
      'tests/unit/council/providers/ProviderFactoryModelSelection.test.ts',
    ]) {
      await read(file);
      expect(scripts['gofer:orchestration:test']).toContain(file);
    }
  });
});
