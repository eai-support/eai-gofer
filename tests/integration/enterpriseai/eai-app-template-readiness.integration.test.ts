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

function run(root: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', ...args], {
    encoding: 'utf8',
  });
  return {
    ...result,
    report: JSON.parse(result.stdout),
  };
}

function sourceReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'eai.cli_managed_source_validation.v1',
    status: 'passed',
    sourceMode: 'eai-cli-generated',
    templateCommitSha: 'a'.repeat(40),
    fileCount: 3,
    totalBytes: 128,
    ...overrides,
  };
}

function fakeCli(output: unknown, exitCode = 0, checkCwd?: string): string {
  const cliRoot = makeRoot();
  const cli = path.join(cliRoot, 'selected-cli.cjs');
  fs.writeFileSync(
    cli,
    `
    const args = process.argv.slice(2);
    if (JSON.stringify(args) !== JSON.stringify(['deploy', 'source', 'validate', '--format', 'json'])
      ${checkCwd ? `|| require('node:fs').realpathSync(process.cwd()) !== ${JSON.stringify(fs.realpathSync(checkCwd))}` : ''}) process.exit(9);
    require('node:fs').writeSync(1, ${JSON.stringify(typeof output === 'string' ? output : JSON.stringify(output))});
    process.exit(${exitCode});
  `
  );
  return cli;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('EAI app-template readiness gate', () => {
  it.each([['--source'], ['--cli'], ['--source', 'unsupported']])(
    'does not report readiness for malformed selection %j',
    (...args) => {
      const root = makeRoot();
      writeReadyProject(root);
      const result = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', ...args], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain(root);
    }
  );

  it('checks the selected CLI publication boundary before managed-source readiness without changing app files', () => {
    const root = makeRoot();
    writeReadyProject(root);
    write(root, 'src/app/counter.tsx', 'export const counter = 1;');
    const before = fs.readFileSync(path.join(root, 'src/app/counter.tsx'));

    const result = run(root, [
      '--source',
      'eai-managed',
      '--cli',
      fakeCli(sourceReport(), 0, root),
    ]);

    expect(result.status).toBe(0);
    expect(result.report.sourceValidation).toEqual({
      status: 'passed',
      fileCount: 3,
      totalBytes: 128,
    });
    expect(result.report.nextAction).toContain('does not prove publication or deployment');
    expect(fs.readFileSync(path.join(root, 'src/app/counter.tsx'))).toEqual(before);
    expect(fs.existsSync(path.join(root, '.eai'))).toBe(false);
  });

  it('blocks managed readiness on unsupported platform edits while preserving the business change', () => {
    const root = makeRoot();
    writeReadyProject(root);
    write(root, 'run.sh', 'platform runner change');
    write(root, 'src/app/counter.tsx', 'approved business change');
    const privateMessage = 'private context which must never be printed';
    const report = {
      schemaVersion: 'eai.cli_managed_source_validation.v1',
      status: 'failed',
      sourceMode: 'eai-cli-generated',
      error: { code: 'SOURCE_SCOPE_UNSUPPORTED', message: privateMessage },
    };

    const result = run(root, ['--source', 'eai-managed', '--cli', fakeCli(report, 1)]);

    expect(result.status).toBe(2);
    expect(result.report.status).toBe('source_not_ready');
    expect(result.report.sourceValidation.code).toBe('SOURCE_SCOPE_UNSUPPORTED');
    expect(result.report.nextAction).toContain('Preserve business changes');
    expect(result.stdout).not.toContain(privateMessage);
    expect(fs.readFileSync(path.join(root, 'run.sh'), 'utf8')).toBe('platform runner change');
    expect(fs.readFileSync(path.join(root, 'src/app/counter.tsx'), 'utf8')).toBe(
      'approved business change'
    );
  });

  it.each([undefined, 'local-only', 'customer-owned'])(
    'does not impose a managed-source gate for %s',
    (source) => {
      const root = makeRoot();
      writeReadyProject(root);
      const args = ['--cli', path.join(root, 'unavailable-cli')];
      if (source) args.push('--source', source);
      const result = run(root, args);
      expect(result.status).toBe(0);
      expect(result.report.sourceValidation).toBeUndefined();
    }
  );

  it('fails closed for a missing explicit CLI without falling back to a global publication command', () => {
    const root = makeRoot();
    writeReadyProject(root);
    const result = run(root, [
      '--source',
      'eai-managed',
      '--cli',
      path.join(root, 'unavailable-cli'),
    ]);
    expect(result.status).toBe(2);
    expect(result.report.sourceValidation.code).toBe('SOURCE_VALIDATOR_UNAVAILABLE');
    expect(result.stdout).not.toContain(root);
  });

  it.each([
    ['malformed JSON', '{', 0],
    ['wrong schema', sourceReport({ schemaVersion: 'another.schema' }), 0],
    ['wrong source', sourceReport({ sourceMode: 'source-unknown' }), 0],
    ['invalid pin', sourceReport({ templateCommitSha: ['a'.repeat(40)] }), 0],
    ['excessive files', sourceReport({ fileCount: 501 }), 0],
    ['excessive bytes', sourceReport({ totalBytes: 20 * 1024 * 1024 + 1 }), 0],
    ['raw source included', sourceReport({ files: [{ contentBase64: 'private-source' }] }), 0],
    ['contradictory exit', sourceReport(), 1],
  ])('rejects %s without printing unvalidated CLI output', (_label, report, exitCode) => {
    const root = makeRoot();
    writeReadyProject(root);
    const result = run(root, ['--source', 'eai-managed', '--cli', fakeCli(report, exitCode)]);
    expect(result.status).toBe(2);
    expect(result.report.sourceValidation.code).toBe('SOURCE_VALIDATOR_INVALID');
    expect(result.stdout).not.toContain('private-source');
  });

  it('bounds CLI output rather than accepting or printing a partial report', () => {
    const root = makeRoot();
    writeReadyProject(root);
    const result = run(root, ['--source', 'eai-managed', '--cli', fakeCli('x'.repeat(70 * 1024))]);
    expect(result.status).toBe(2);
    expect(result.report.sourceValidation.code).toBe('SOURCE_VALIDATOR_UNAVAILABLE');
    expect(result.stdout.length).toBeLessThan(4096);
  });

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
});
