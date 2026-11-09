import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const excludedPaths = [
  'dist/',
  'graphify-out/',
  'docs-site/static/releases/eai-gofer-',
  'docs-site/static/releases/gofer-',
];

function trackedTextFiles(): string[] {
  return execFileSync('git', ['grep', '-Il', '-e', '', '--', '.'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !excludedPaths.some((prefix) => file.startsWith(prefix)));
}

describe('PublicAPI guidance across Gofer surfaces', () => {
  it('contains no pre-v4 EAI endpoint examples or compatibility guidance', () => {
    const forbidden = [
      /\/api\/eai\/v[123](?:\/|\b)/i,
      /\/v[123]\/(?:platform|data|ai|chat|documents|resources|workflows|goals|targets|tenants|users)(?:\/|\b)/i,
      /legacy\s+v[123]/i,
      /v1\/v3/i,
      /v3\s+route-family/i,
      /eai\.publicapi\.capability\.[a-z0-9-]+\.v[123]\b/i,
    ];
    const findings: string[] = [];

    for (const file of trackedTextFiles()) {
      const lines = readFileSync(resolve(repoRoot, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (forbidden.some((pattern) => pattern.test(line))) {
          findings.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(findings).toEqual([]);
  });
});
