import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowsDirectory = path.join(root, '.github/workflows');

describe('dependency admission CI contract', () => {
  it('runs admission before root package installation and requires an allow decision', async () => {
    const workflow = await readFile(path.join(workflowsDirectory, 'ci.yml'), 'utf8');
    expect(workflow).toContain('dependency-admission:');
    expect(workflow).toContain('gofer-npm-dependency-evidence.mjs');
    expect(workflow).toContain('gofer-dependency-admission.mjs');
    expect(workflow).toContain('--require-allow');
    expect(workflow).toContain('.github/dependency-security-exceptions.json');
    expect(workflow.indexOf('gofer-dependency-admission.mjs')).toBeLessThan(
      workflow.indexOf('npm ci --ignore-scripts')
    );
  });

  it('disables lifecycle scripts for every frozen workflow installation', async () => {
    const files = (await readdir(workflowsDirectory)).filter((file) => file.endsWith('.yml'));
    const workflows = await Promise.all(
      files.map(async (file) => ({
        file,
        content: await readFile(path.join(workflowsDirectory, file), 'utf8'),
      }))
    );
    for (const { file, content } of workflows) {
      for (const line of content
        .split('\n')
        .filter((line) => /npm(?:\s+--prefix\s+\S+)?\s+ci\b/.test(line))) {
        expect(line, `${file}: ${line}`).toContain('--ignore-scripts');
      }
    }
  });
});
