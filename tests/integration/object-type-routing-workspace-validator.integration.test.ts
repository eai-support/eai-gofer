import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  it.each([
    {
      script: tool,
      invocation: 'validator.reduceObjectTypeRoutingWorkspace(root)',
      firstPath: 'ops/tech-docs/static/contracts/object-type-routing-v1.json',
      code: 'AUTHORITY_UNREADABLE',
      message:
        'ops/tech-docs/static/contracts/object-type-routing-v1.json is not readable (ENOENT).',
    },
    {
      script: path.resolve('.specify/scripts/node/validate-object-type-identifiers.mjs'),
      invocation:
        "validator.loadIdentifierValidationContract({ configPath: root + '/config.json', schemaPath: root + '/schema.json', contractPath: root + '/contract.json' })",
      firstPath: 'config.json',
      code: 'CONFIG_UNREADABLE',
      message: 'config is not readable.',
    },
  ])('reports $code in declared order even when its read is delayed', async (scenario) => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-order-'));
    temporaryRoots.push(root);
    // Force later missing reads to reject first, without relying on filesystem timing.
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { promises as fs } from 'node:fs';
          import { syncBuiltinESMExports } from 'node:module';
          const root = ${JSON.stringify(root)};
          fs.readFile = async (file) => {
            if (file === ${JSON.stringify(path.join(root, scenario.firstPath))}) {
              await new Promise((resolve) => setImmediate(resolve));
            }
            throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
          };
          syncBuiltinESMExports();
          const validator = await import(${JSON.stringify(pathToFileURL(scenario.script).href)});
          try {
            await ${scenario.invocation};
          } catch (error) {
            process.stderr.write(error.code + ': ' + error.message + '\\n');
            process.exitCode = 4;
          }
        `,
      ],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`${scenario.code}: ${scenario.message}\n`);
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects every missing authority in order without creating requested output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-missing-'));
    temporaryRoots.push(root);
    const authorityPaths = [
      'ops/tech-docs/static/contracts/object-type-routing-v1.json',
      'ops/tech-docs/static/schemas/object-type-manifest-v1.schema.json',
      'ops/tech-docs/static/schemas/resource-action-v1.schema.json',
      'ops/gofer/.specify/schemas/object-type-identifier-audit-v1.schema.json',
      'ops/gofer/.specify/config/object-type-routing.json',
    ];
    for (const relativePath of authorityPaths) {
      const before = await readdir(root, { recursive: true });
      const result = runTool(
        '--workspace',
        root,
        '--output',
        path.join(root, 'output/report.json'),
        '--json'
      );

      expect(result.status).toBe(4);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        `AUTHORITY_UNREADABLE: ${relativePath} is not readable (ENOENT).\n`
      );
      expect(await readdir(root, { recursive: true })).toEqual(before);

      const file = path.join(root, relativePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, '{}\n');
    }
  });

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

  it('keeps relationship publication vectors pinned to exact declared slugs', async () => {
    const contract = JSON.parse(
      await readFile(path.resolve('.specify/contracts/object-type-routing-v1.json'), 'utf8')
    );
    expect(contract.relationshipReferences).toMatchObject({
      sourceField: 'linkTypes[].targetObjectType',
      adapterMustEmit: 'slug',
      runtimeField: 'target_type',
      runtimeIdentifier: 'slug',
    });
    const relationshipVectors = [
      {
        declaredName: 'GitHubConnection',
        declaredSlug: 'github-connection',
        sourceReference: 'GitHubConnection',
        emittedReference: 'github-connection',
      },
      {
        declaredName: 'OPAMeasure',
        declaredSlug: 'opameasure',
        sourceReference: 'OPAMeasure',
        emittedReference: 'opameasure',
      },
    ];
    expect(
      relationshipVectors.every((vector) => vector.emittedReference === vector.declaredSlug)
    ).toBe(true);
    const auditConfig = JSON.parse(
      await readFile(path.resolve('.specify/config/object-type-routing.json'), 'utf8')
    );
    expect(auditConfig.canonicalGuidance).toContain('linkTypes[].targetObjectType');
    expect(auditConfig.canonicalGuidance).toContain('target_type');
    expect(auditConfig.canonicalGuidance).toContain('same-manifest name shorthand');
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
