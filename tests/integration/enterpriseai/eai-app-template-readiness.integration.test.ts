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

function run(root: string) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json'], {
    encoding: 'utf8',
  });
  return {
    ...result,
    report: JSON.parse(result.stdout),
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
