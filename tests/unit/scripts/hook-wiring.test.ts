/**
 * T056 — Hook wiring test.
 *
 * Verifies the root package.json contains the expected npm scripts:
 * 1. gofer:codex-doctor is present and references the correct file
 * 2. gofer:generate is present and references the correct file
 * 3. gofer:mermaid-export is present and references the correct file
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

interface PackageJson {
  scripts: Record<string, string>;
  [key: string]: unknown;
}

describe('hook-wiring (T056)', () => {
  let packageJson: PackageJson;

  beforeAll(async () => {
    const raw = await fs.readFile(PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(raw) as PackageJson;
  });

  it('package.json has a scripts section', () => {
    expect(packageJson.scripts).toBeDefined();
    expect(typeof packageJson.scripts).toBe('object');
  });

  // -------------------------------------------------------------------------
  // Script presence checks
  // -------------------------------------------------------------------------

  it('gofer:codex-doctor script is present', () => {
    expect(packageJson.scripts, 'package.json is missing gofer:codex-doctor script').toHaveProperty(
      'gofer:codex-doctor'
    );
  });

  it('gofer:generate script is present', () => {
    expect(packageJson.scripts, 'package.json is missing gofer:generate script').toHaveProperty(
      'gofer:generate'
    );
  });

  it('gofer:generate:check script is present', () => {
    expect(
      packageJson.scripts,
      'package.json is missing gofer:generate:check script'
    ).toHaveProperty('gofer:generate:check');
  });

  it('gofer:mermaid-export script is present', () => {
    expect(
      packageJson.scripts,
      'package.json is missing gofer:mermaid-export script'
    ).toHaveProperty('gofer:mermaid-export');
  });

  it('gofer:package-plugin script is present', () => {
    expect(
      packageJson.scripts,
      'package.json is missing gofer:package-plugin script'
    ).toHaveProperty('gofer:package-plugin');
  });

  it('gofer:perf-baseline script is present', () => {
    expect(
      packageJson.scripts,
      'package.json is missing gofer:perf-baseline script'
    ).toHaveProperty('gofer:perf-baseline');
  });

  it('gofer:version-check script is present', () => {
    expect(
      packageJson.scripts,
      'package.json is missing gofer:version-check script'
    ).toHaveProperty('gofer:version-check');
  });

  // -------------------------------------------------------------------------
  // Script file path checks
  // -------------------------------------------------------------------------

  it('gofer:codex-doctor references codex-doctor.mjs', () => {
    const script = packageJson.scripts['gofer:codex-doctor'];
    expect(script).toContain('codex-doctor.mjs');
  });

  it('gofer:codex-doctor references the .specify/scripts/node/ path', () => {
    const script = packageJson.scripts['gofer:codex-doctor'];
    expect(script).toContain('.specify/scripts/node/');
  });

  it('gofer:generate references generate-commands.mjs', () => {
    const script = packageJson.scripts['gofer:generate'];
    expect(script).toContain('generate-commands.mjs');
  });

  it('gofer:generate references the .specify/scripts/node/ path', () => {
    const script = packageJson.scripts['gofer:generate'];
    expect(script).toContain('.specify/scripts/node/');
  });

  it('gofer:generate uses the Node-based extension resource sync script', () => {
    const script = packageJson.scripts['gofer:generate'];
    expect(script).toContain('sync-extension-resources.mjs');
    expect(script).not.toContain('./scripts/sync-extension-resources.sh');
    expect(script).not.toContain(' cp ');
  });

  it('gofer:generate:check uses dependency-free check modes for generation and sync', () => {
    const script = packageJson.scripts['gofer:generate:check'];
    expect(script).toContain('generate-commands.mjs --check');
    expect(script).toContain('sync-extension-resources.mjs --check');
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:mermaid-export references mermaid-export.mjs', () => {
    const script = packageJson.scripts['gofer:mermaid-export'];
    expect(script).toContain('mermaid-export.mjs');
  });

  it('gofer:mermaid-export references the .specify/scripts/node/ path', () => {
    const script = packageJson.scripts['gofer:mermaid-export'];
    expect(script).toContain('.specify/scripts/node/');
  });

  it('gofer:package-plugin references package-agent-plugin.mjs', () => {
    const script = packageJson.scripts['gofer:package-plugin'];
    expect(script).toContain('package-agent-plugin.mjs');
    expect(script).toContain('.specify/scripts/node/');
  });

  it('gofer:perf-baseline references gofer-performance-report.mjs', () => {
    const script = packageJson.scripts['gofer:perf-baseline'];
    expect(script).toContain('gofer-performance-report.mjs');
    expect(script).toContain('.specify/scripts/node/');
  });

  it('gofer:version-check references check-version-alignment.mjs', () => {
    const script = packageJson.scripts['gofer:version-check'];
    expect(script).toContain('check-version-alignment.mjs');
    expect(script).toContain('.specify/scripts/node/');
  });

  // -------------------------------------------------------------------------
  // Script invocation style — should use node directly (not tsx/ts-node)
  // -------------------------------------------------------------------------

  it('gofer:codex-doctor uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:codex-doctor'];
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:generate uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:generate'];
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:mermaid-export uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:mermaid-export'];
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:package-plugin uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:package-plugin'];
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:perf-baseline uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:perf-baseline'];
    expect(script).toMatch(/^node\s/);
  });

  it('gofer:version-check uses node to invoke the script', () => {
    const script = packageJson.scripts['gofer:version-check'];
    expect(script).toMatch(/^node\s/);
  });

  // -------------------------------------------------------------------------
  // Referenced script files actually exist on disk
  // -------------------------------------------------------------------------

  it('codex-doctor.mjs exists on disk', async () => {
    const scriptPath = path.join(PROJECT_ROOT, '.specify', 'scripts', 'node', 'codex-doctor.mjs');
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `codex-doctor.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('generate-commands.mjs exists on disk', async () => {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.specify',
      'scripts',
      'node',
      'generate-commands.mjs'
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `generate-commands.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('sync-extension-resources.mjs exists on disk', async () => {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.specify',
      'scripts',
      'node',
      'sync-extension-resources.mjs'
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `sync-extension-resources.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('mermaid-export.mjs exists on disk', async () => {
    const scriptPath = path.join(PROJECT_ROOT, '.specify', 'scripts', 'node', 'mermaid-export.mjs');
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `mermaid-export.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('package-agent-plugin.mjs exists on disk', async () => {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.specify',
      'scripts',
      'node',
      'package-agent-plugin.mjs'
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `package-agent-plugin.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('gofer-performance-report.mjs exists on disk', async () => {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.specify',
      'scripts',
      'node',
      'gofer-performance-report.mjs'
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `gofer-performance-report.mjs not found at ${scriptPath}`).not.toBeNull();
  });

  it('check-version-alignment.mjs exists on disk', async () => {
    const scriptPath = path.join(
      PROJECT_ROOT,
      '.specify',
      'scripts',
      'node',
      'check-version-alignment.mjs'
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat, `check-version-alignment.mjs not found at ${scriptPath}`).not.toBeNull();
  });
});
