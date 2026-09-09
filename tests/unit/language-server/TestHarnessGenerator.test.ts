import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { TestHarnessGenerator } from '../../../language-server/src/utils/TestHarnessGenerator';

describe('TestHarnessGenerator source injection protection', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-harness-security-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    'Normal task description',
    '*/\nglobalThis.injected = true;\n/*',
    '*/\r\nglobalThis.injected = true; //',
    'Quotes: \' " `; backslash: \\; ${globalThis.injected = true}',
    'Line one\nline two\rline three\u2028line four\u2029line five\0',
    '/* nested */ */ <!-- --> // \\u002a/',
  ])('preserves description as data, not executable source: %j', async (description) => {
    const specId = '001-security';
    const taskId = 'T001';
    const file = await new TestHarnessGenerator(root).ensureTestHarness(
      specId,
      taskId,
      description
    );
    const source = await fs.readFile(file, 'utf8');
    const metadata = source.match(/ \* (\{[^]*?\})\n/);
    expect(metadata).not.toBeNull();
    expect(JSON.parse(metadata![1])).toEqual({ specId, taskId, description });
    const loaded = loadHarness(source);
    expect(loaded.injected).toBe(false);
    expect(loaded.suites).toEqual([`${specId} - ${taskId}`]);
    expect(loaded.tests).toEqual([`should fulfill acceptance criteria for ${taskId}`]);
  });

  it('quotes IDs in executable titles instead of interpolating source', async () => {
    const specId = "001-customer's-feature";
    const taskId = "T001'); globalThis.injected = true; ('";
    const file = await new TestHarnessGenerator(root).ensureTestHarness(specId, taskId, 'Task');
    const source = await fs.readFile(file, 'utf8');
    const loaded = loadHarness(source);
    expect(loaded.injected).toBe(false);
    expect(loaded.suites).toEqual([`${specId} - ${taskId}`]);
    expect(loaded.tests).toEqual([`should fulfill acceptance criteria for ${taskId}`]);
    expect(path.dirname(file)).toBe(path.join(root, 'tests', 'generated', specId));
  });

  it('retains an existing harness without overwriting user changes', async () => {
    const generator = new TestHarnessGenerator(root);
    const file = await generator.ensureTestHarness('001-security', 'T001', 'Original');
    await fs.writeFile(file, '// User-owned implementation\n');
    expect(await generator.ensureTestHarness('001-security', 'T001', 'Replacement')).toBe(file);
    expect(await fs.readFile(file, 'utf8')).toBe('// User-owned implementation\n');
  });
});

function loadHarness(source: string) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  expect(
    compiled.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error)
  ).toEqual([]);
  const suites: string[] = [];
  const tests: string[] = [];
  const context = {
    injected: false,
    exports: {},
    require(name: string) {
      if (['fs/promises', 'path', 'os'].includes(name)) return {};
      if (name !== 'vitest') throw new Error(`Unexpected generated import: ${name}`);
      return {
        describe(title: string, callback: () => void) {
          suites.push(title);
          callback();
        },
        it(title: string) {
          tests.push(title);
        },
        beforeEach() {},
        afterEach() {},
      };
    },
  };
  // Register the generated suite only; fixture hooks and test bodies are not executed.
  vm.runInNewContext(compiled.outputText, context, { timeout: 1000 });
  return { suites, tests, injected: context.injected };
}
