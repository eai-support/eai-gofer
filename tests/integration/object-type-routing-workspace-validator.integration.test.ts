import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { executableTypeScriptDeriver } from '../../.specify/scripts/node/validate-object-type-routing-workspace.mjs';

const tool = path.resolve('.specify/scripts/node/validate-object-type-routing-workspace.mjs');
const workspace = path.resolve('../..');
const hasCoordinatedWorkspace = existsSync(
  path.join(workspace, 'ops', 'tech-docs', 'static', 'contracts', 'object-type-routing-v1.json')
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function runTool(...arguments_: string[]) {
  return spawnSync(process.execPath, [tool, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('Object Type routing workspace reducer', () => {
  it('executes TypeScript adapters with their established mapping and ASCII trim helpers', () => {
    const source = `
      const ESTABLISHED_NAME_SLUGS = new Map([['GitHubConnection', 'github-connection']]);
      function isAsciiWhitespace(code: number): boolean {
        return code === 0x20 || (code >= 0x09 && code <= 0x0d);
      }
      function trimAsciiWhitespace(value: string): string {
        let start = 0;
        let end = value.length;
        while (start < end && isAsciiWhitespace(value.charCodeAt(start))) start += 1;
        while (end > start && isAsciiWhitespace(value.charCodeAt(end - 1))) end -= 1;
        return value.slice(start, end);
      }
      export function deriveObjectTypeSlugV1(value: string): string {
        const normalizedName = trimAsciiWhitespace(value);
        const derivationSource = ESTABLISHED_NAME_SLUGS.get(normalizedName) ?? normalizedName;
        return derivationSource
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .replace(/[\\t\\n\\v\\f\\r ]+|_+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase();
      }
    `;
    const derive = executableTypeScriptDeriver(source, 'fixture');

    expect(derive('  HTTPFeedItem  ')).toBe('http-feed-item');
    expect(derive('GitHubConnection')).toBe('github-connection');
  });

  it('verifies committed feature changes relative to origin/main and keeps the extension mirror exact', async () => {
    const canonical = await readFile(
      path.resolve('.specify/scripts/bash/verify-object-type-routing-workspace.sh'),
      'utf8'
    );
    const mirror = await readFile(
      path.resolve('extension/resources/bash-scripts/verify-object-type-routing-workspace.sh'),
      'utf8'
    );
    const contract = await readFile(
      path.resolve('.specify/contracts/object-type-routing-v1.json'),
      'utf8'
    );
    const installedContract = await readFile(
      path.resolve('extension/resources/contracts/object-type-routing-v1.json'),
      'utf8'
    );

    expect(mirror).toBe(canonical);
    expect(installedContract).toBe(contract);
    expect(canonical.match(/diff -U0 origin\/main --/g)).toHaveLength(2);
    expect(canonical).not.toContain('diff -U0 -- src/app/core/telemetry.py');
    expect(canonical).toContain('"mid/AdminAPI/.eai/test-coverage.json"');
    expect(canonical).toContain('"AdminAPI|uv run pytest tests/test_object_type_identifiers.py');
    expect(canonical).toContain('AdminAPI) echo "$WORKSPACE_ROOT/mid/AdminAPI"');
    expect(canonical).toContain(
      'VERIFY_OBJECT_TYPE_ROUTING_WORKSPACE_OK repositories=9 coverage_maps=9'
    );
  });

  it('reduces the coordinated workspace deterministically or fails closed in an isolated checkout', async () => {
    const before = await readdir(path.resolve('.specify/scripts/node'));
    const first = runTool('--workspace', workspace, '--json');
    const second = runTool('--workspace', workspace, '--json');

    expect(second.status).toBe(first.status);
    if (!hasCoordinatedWorkspace) {
      expect(first.status).toBe(4);
      expect(first.stdout).toBe('');
      expect(first.stderr).toMatch(/^(?:AUTHORITY|CONTRACT)_UNREADABLE:/);
      expect(second.stdout).toBe(first.stdout);
      expect(second.stderr).toBe(first.stderr);
      expect(await readdir(path.resolve('.specify/scripts/node'))).toEqual(before);
      return;
    }

    expect([0, 2]).toContain(first.status);
    expect(first.stderr).toBe('');
    expect(second.stderr).toBe('');
    expect(second.stdout).toBe(first.stdout);

    const report = JSON.parse(first.stdout);
    expect(report).toMatchObject({
      schemaVersion: 'eai.object-type-routing.workspace-compatibility/v1',
      contractVersion: 'eai.object-type-routing/v1',
      authoritativeTransportIdentifier: 'slug',
      compatible: report.blockingFindingCount === 0,
      exitCode: first.status,
    });
    expect(report.adapters.map((adapter: { component: string }) => adapter.component)).toEqual([
      'Configurator',
      'eai-app-template',
      'eai-cli',
      'eai-gofer',
      'PublicAPI',
      'AdminAPI',
      'ResourceAPI',
    ]);
    expect(
      report.adapters.every((adapter: { vectors: unknown[] }) => adapter.vectors.length === 11)
    ).toBe(true);
    expect(report.coverageOwnership.map((owner: { component: string }) => owner.component)).toEqual(
      [
        'Configurator',
        'eai-app-template',
        'eai-cli',
        'eai-gofer',
        'PublicAPI',
        'AdminAPI',
        'ResourceAPI',
        'tech-docs',
      ]
    );
    expect(await readdir(path.resolve('.specify/scripts/node'))).toEqual(before);
  }, 30_000);

  it('writes only for a coordinated workspace when --output is supplied', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-workspace-'));
    temporaryRoots.push(root);
    const output = path.join(root, 'nested', 'compatibility.json');

    const result = runTool('--workspace', workspace, '--output', output, '--json');
    if (!hasCoordinatedWorkspace) {
      expect(result.status).toBe(4);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^(?:AUTHORITY|CONTRACT)_UNREADABLE:/);
      expect(await readdir(root)).toEqual([]);
      return;
    }

    expect([0, 2]).toContain(result.status);
    const fromStdout = JSON.parse(result.stdout);
    const fromFile = JSON.parse(await readFile(output, 'utf8'));
    expect(fromFile).toEqual(fromStdout);
    expect(fromFile.exitCode).toBe(result.status);
    expect((await readdir(path.dirname(output))).sort()).toEqual(['compatibility.json']);
  }, 30_000);

  it('returns exit 4 for malformed arguments without creating output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-workspace-'));
    temporaryRoots.push(root);
    const output = path.join(root, 'compatibility.json');

    const result = runTool('--workspace', workspace, '--output', output, '--unknown');

    expect(result.status).toBe(4);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('ARGUMENT_UNSUPPORTED');
    expect(await readdir(root)).toEqual([]);
  });
});
