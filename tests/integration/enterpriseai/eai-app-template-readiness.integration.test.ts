import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.join(process.cwd(), '.specify/scripts/node/eai-app-template-readiness.mjs');
const tempRoots: string[] = [];
const requiredFiles = [
  'eai.runtime.json',
  'src/eai.config/object-types.ts',
  'src/eai.config/register.ts',
  '.env.example',
  '.npmrc',
  'package.json',
];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eai-template-readiness-'));
  tempRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content = ''): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function validManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    template: {
      repo: 'https://github.com/eai-support/eai-app-template.git',
      displaySource: 'eai-support/eai-app-template@abcdef1',
      initializedAt: '2026-08-18T00:00:00.000Z',
    },
    ...overrides,
  });
}

function writeReadyProject(root: string): void {
  write(root, '.eai-manifest.json', validManifest());
  for (const relativePath of requiredFiles) {
    write(
      root,
      relativePath,
      relativePath.endsWith('.json') ? '{"schemaVersion":1}' : 'template marker\n'
    );
  }
}

function run(root: string, cliEntry?: string) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--root', root, '--json', ...(cliEntry ? ['--cli-entry', cliEntry] : [])],
    {
      encoding: 'utf8',
    }
  );
  return {
    ...result,
    report: JSON.parse(result.stdout),
  };
}

function writeGeneratedDemo(root: string, overrides: Record<string, unknown> = {}): void {
  write(
    root,
    '.eai-manifest.json',
    JSON.stringify({
      schemaVersion: 'eai.generated_app_manifest.v1',
      sourceMode: 'admin-portal-generated',
      appKey: 'fleet-demo',
      templateRepository: 'eai-tools/eai-app-template',
      generatedDemo: {
        schemaVersion: 'eai.generated_app_artifact.v2',
        artifactDigest: `sha256:${'a'.repeat(64)}`,
      },
      ...overrides,
    })
  );
  for (const relativePath of requiredFiles) {
    write(root, relativePath, relativePath.endsWith('.json') ? '{}' : 'template marker\n');
  }
}

function fakeCli(response: Record<string, unknown> | string): string {
  const root = makeRoot();
  const entry = path.join(root, 'installed-cli.mjs');
  const output = typeof response === 'string' ? response : JSON.stringify(response);
  fs.writeFileSync(
    entry,
    `if (process.argv.slice(2).join(' ') !==
    \`app continue-demo --path \${process.argv[5]} --format json\`)
    process.exit(2);
  process.stdout.write(${JSON.stringify(output)});`
  );
  return entry;
}

function verifiedDemoOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceMode: 'admin-portal-generated',
    appArtifactMode: 'app-v2-demo',
    adapterStatus: 'demo-only',
    runtimeBindingRecorded: false,
    appKey: 'fleet-demo',
    acceptedArtifactDigest: `sha256:${'a'.repeat(64)}`,
    commitSha: 'b'.repeat(40),
    ...overrides,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('EAI app-template readiness gate', () => {
  it('blocks an empty folder before app delivery starts', () => {
    const result = run(makeRoot());

    expect(result.status).toBe(2);
    expect(result.report.status).toBe('not_initialized');
    expect(result.report.nextAction).toContain('eai init');
  });

  it('blocks copied template fragments without eai init provenance', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}');
    write(root, 'src/eai.config/object-types.ts', 'export {};');

    const result = run(root);

    expect(result.status).toBe(2);
    expect(result.report.status).toBe('partial');
    expect(result.report.reasons).toContain('The project has no eai init provenance manifest.');
  });

  it('blocks malformed provenance and unsupported custom templates', () => {
    const malformedRoot = makeRoot();
    write(malformedRoot, '.eai-manifest.json', '{');
    expect(run(malformedRoot).report.status).toBe('invalid_manifest');

    const customRoot = makeRoot();
    writeReadyProject(customRoot);
    write(
      customRoot,
      '.eai-manifest.json',
      validManifest({
        template: {
          repo: 'https://github.com/example/custom-template.git',
          initializedAt: '2026-08-18T00:00:00.000Z',
        },
      })
    );
    expect(run(customRoot).report.status).toBe('unsupported_template');
  });

  it('accepts a release-tagged template on manifests that predate the repo field', () => {
    const root = makeRoot();
    writeReadyProject(root);
    // Legacy manifests carry no template.repo, so displaySource is the only
    // provenance available and its ref must normalize away whether the template
    // was pinned by release tag or by commit SHA.
    write(
      root,
      '.eai-manifest.json',
      validManifest({
        template: {
          displaySource: 'eai-support/eai-app-template@v1.10.2',
          initializedAt: '2026-08-18T00:00:00.000Z',
        },
      })
    );

    const result = run(root);

    expect(result.report.status).not.toBe('unsupported_template');
    expect(result.report.ready).toBe(true);
  });

  it('blocks a damaged app even when the provenance manifest is valid', () => {
    const root = makeRoot();
    writeReadyProject(root);
    fs.rmSync(path.join(root, 'eai.runtime.json'));

    const result = run(root);

    expect(result.status).toBe(2);
    expect(result.report.status).toBe('partial');
    expect(result.report.missingFiles).toContain('eai.runtime.json');
  });

  it('allows a complete app created from the canonical template', () => {
    const root = makeRoot();
    writeReadyProject(root);

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.report.status).toBe('ready');
    expect(result.report.ready).toBe(true);
  });

  it('allows the canonical template URL with a trailing slash', () => {
    const root = makeRoot();
    writeReadyProject(root);
    write(
      root,
      '.eai-manifest.json',
      validManifest({
        template: {
          repo: 'https://github.com/eai-support/eai-app-template.git/',
          initializedAt: '2026-08-18T00:00:00.000Z',
        },
      })
    );

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.report.status).toBe('ready');
  });

  it('does not print manifest values that may contain private context', () => {
    const root = makeRoot();
    writeReadyProject(root);
    const privateValue = 'private-tenant-value-that-must-not-leak';
    write(root, '.eai-manifest.json', validManifest({ privateContext: privateValue }));

    const output = execFileSync(process.execPath, [SCRIPT, '--root', root, '--json'], {
      encoding: 'utf8',
    });

    expect(output).not.toContain(privateValue);
    expect(output).not.toContain(root);
  });

  it('recognizes a Portal-owned demo without suggesting eai init or treating it as operational', () => {
    const root = makeRoot();
    writeGeneratedDemo(root);

    const unverified = run(root);
    expect(unverified.status).toBe(2);
    expect(unverified.report).toMatchObject({
      ready: false,
      status: 'generated_demo_unverified',
      sourceMode: 'generated-demo',
      adapterStatus: 'demo-only',
    });
    expect(unverified.report.nextAction).toContain('Never run eai init');

    const verified = run(root, fakeCli(verifiedDemoOutput()));
    expect(verified.status).toBe(0);
    expect(verified.report).toMatchObject({
      ready: true,
      status: 'ready',
      sourceMode: 'generated-demo',
      adapterStatus: 'demo-only',
    });
    expect(verified.report.nextAction).toContain('Keep sample data and actions simulated');
  });

  it('fails closed on malformed, legacy, or mismatched CLI inspection', () => {
    const root = makeRoot();
    writeGeneratedDemo(root);
    for (const response of [
      '{invalid',
      verifiedDemoOutput({ appArtifactMode: null, runtimeBindingRecorded: true }),
      verifiedDemoOutput({ acceptedArtifactDigest: `sha256:${'c'.repeat(64)}` }),
      verifiedDemoOutput({ adapterStatus: 'operational' }),
    ]) {
      const result = run(root, fakeCli(response));
      expect(result.status).toBe(2);
      expect(result.report.status).toBe('generated_demo_unverified');
    }
  });

  it('refuses to execute a CLI entry from the generated repository', () => {
    const root = makeRoot();
    writeGeneratedDemo(root);
    const localEntry = path.join(root, 'node_modules/.bin/fake-cli.mjs');
    write(
      root,
      'node_modules/.bin/fake-cli.mjs',
      `process.stdout.write(${JSON.stringify(JSON.stringify(verifiedDemoOutput()))});`
    );

    const result = run(root, localEntry);
    expect(result.status).toBe(2);
    expect(result.report.status).toBe('generated_demo_unverified');
  });

  it('never turns a legacy or mixed-authority generated manifest into a ready app', () => {
    const root = makeRoot();
    writeGeneratedDemo(root, { generatedDemo: undefined, runtimeBinding: {} });
    const result = run(root, fakeCli(verifiedDemoOutput()));
    expect(result.status).toBe(2);
    expect(result.report.status).toBe('generated_demo_unverified');
    expect(result.report.nextAction).toContain('Never run eai init');

    writeGeneratedDemo(root, { schemaVersion: 'eai.generated_app_manifest.v3' });
    const wrongSchema = run(root, fakeCli(verifiedDemoOutput()));
    expect(wrongSchema.status).toBe(2);
    expect(wrongSchema.report.status).toBe('generated_demo_unverified');
    expect(wrongSchema.report.nextAction).toContain('Never run eai init');
  });
});
