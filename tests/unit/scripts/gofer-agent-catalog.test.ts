import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const helper = '.specify/scripts/node/gofer-agent-catalog.mjs';
const reference = '.specify/references/agent-catalog.json';
const surfaces = ['claude', 'codex', 'copilot', 'vscode', 'grok', 'antigravity', 'gemini'];
const temps: string[] = [];
// Dynamic import matches the repository's dependency-free Node helper tests.
let readCatalogue: (options?: Record<string, unknown>) => Promise<any>;
let resolveAssignment: (request: Record<string, unknown>, options?: Record<string, unknown>) => Promise<any>;

const request = (overrides: Record<string, unknown> = {}) => ({
  role: 'engineer-review', stage: '5_gofer_implement', task: 'T042: Review the agreed changes',
  revision: 'abcdef1234567890', scope: ['src', 'tests'], surface: 'codex',
  requiredChecks: ['acceptance', 'security'],
  availableModels: ['caller/model-a', 'caller/model-b'], model: 'caller/model-a',
  ...overrides,
});

async function fixture(layout = 'agents') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gofer-agent-catalog-'));
  temps.push(dir);
  await mkdir(path.join(dir, '.specify/references'), { recursive: true });
  await mkdir(path.join(dir, '.specify/scripts/node'), { recursive: true });
  await cp(path.join(root, reference), path.join(dir, reference));
  await cp(path.join(root, helper), path.join(dir, helper));
  await cp(path.join(root, '.claude/agents'), path.join(dir, layout), { recursive: true });
  return dir;
}

async function editCatalogue(dir: string, edit: (catalogue: any) => void) {
  const file = path.join(dir, reference);
  const catalogue = JSON.parse(await readFile(file, 'utf8'));
  edit(catalogue);
  await writeFile(file, JSON.stringify(catalogue));
}

beforeAll(async () => {
  const moduleUrl = new URL(`../../../${helper}`, import.meta.url);
  ({ readCatalogue, resolveAssignment } = await import(moduleUrl.href));
});

afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('shared specialist catalogue', () => {
  it('references exactly all 42 existing bodies without copying their responsibilities', async () => {
    const raw = JSON.parse(await readFile(path.join(root, reference), 'utf8'));
    const names = (await readdir(path.join(root, '.claude/agents'))).filter(n => n.endsWith('.md')).sort();
    expect(raw.roles).toHaveLength(42);
    expect(raw.roles.map((r: any) => `${r.id}.md`).sort()).toEqual(names);
    for (const role of raw.roles) {
      expect(role).toEqual({ id: role.id, body: `agents/${role.id}.md` });
    }
    const catalogue = await readCatalogue({ root });
    for (const role of catalogue.roles) {
      const rawBody = await readFile(path.join(root, '.claude/agents', `${role.id}.md`), 'utf8');
      const closingFence = rawBody.indexOf('\n---\n', 4);
      const expected = rawBody.slice(closingFence + 5);
      expect(closingFence).toBeGreaterThan(0);
      expect(role.content).toBe(expected);
      expect(role.content).not.toMatch(/^(?:model|tools|name|description):/m);
      expect(role.contentSha256).toBe(createHash('sha256').update(expected).digest('hex'));
    }
  });

  it('declares all seven surfaces without claiming native qualification or inventing models', async () => {
    const catalogue = await readCatalogue();
    expect(catalogue.surfaces.map((s: any) => s.id)).toEqual(surfaces);
    for (const surface of catalogue.surfaces) {
      expect(surface).toMatchObject({
        legacy: surface.id === 'gemini', evidenceKind: 'self-declaration',
        independentReadIsolation: 'unqualified', independentExecution: 'unqualified',
      });
      expect(surface).not.toHaveProperty('model');
      expect(surface).not.toHaveProperty('models');
    }
  });

  it.each(['agents', '.claude/agents'])('works with %s as the only role directory', async layout => {
    const dir = await fixture(layout);
    const catalogue = await readCatalogue({ root: dir });
    expect(catalogue.roles).toHaveLength(42);
    expect(catalogue.roles.every((r: any) => r.source.startsWith(`${layout}/`))).toBe(true);
    const assignment = await resolveAssignment(request(), { root: dir });
    expect(assignment.roleContent).toContain('Core Responsibilities');
  });

  it('prefers the package canonical copy and never mixes incomplete layouts', async () => {
    const dir = await fixture();
    await cp(path.join(root, '.claude/agents'), path.join(dir, '.claude/agents'), { recursive: true });
    await writeFile(path.join(dir, 'agents/engineer-review.md'), '# Packaged canonical body\n');
    expect((await resolveAssignment(request(), { root: dir })).roleContent).toMatch(/# Packaged canonical body\n$/);
    await rm(path.join(dir, 'agents/engineer-review.md'));
    await expect(readCatalogue({ root: dir })).rejects.toThrow(/engineer-review/);
  });

  it.each([
    ['duplicate roles', (c: any) => c.roles.push(c.roles[0])],
    ['unsafe body reference', (c: any) => c.roles[0].body = '../outside.md'],
    ['unsupported schema', (c: any) => c.schemaVersion = 999],
    ['duplicate stages', (c: any) => c.stages.push(c.stages[0])],
    ['missing surface', (c: any) => c.surfaces.pop()],
    ['false native claim', (c: any) => c.surfaces[0].independentExecution = 'qualified'],
  ])('rejects catalogue corruption: %s', async (_name, edit) => {
    const dir = await fixture();
    await editCatalogue(dir, edit);
    await expect(readCatalogue({ root: dir })).rejects.toThrow();
  });

  it('rejects body symlinks outside the canonical role directory', async () => {
    const dir = await fixture();
    const target = path.join(dir, 'agents/engineer-review.md');
    await rm(target);
    await symlink(path.join(root, '.claude/agents/engineer-review.md'), target);
    await expect(readCatalogue({ root: dir })).rejects.toThrow(/outside|escape/i);
  });

  it.each([
    ['\uFEFF---\r\nname: ignored\r\nmodel: never-use\r\n---\r\n\r\n# Role\r\n', '\r\n# Role\r\n'],
    ['---\n---\n# Empty header\n', '# Empty header\n'],
    ['# Neutral\n\n---\nKeep this divider.\n', '# Neutral\n\n---\nKeep this divider.\n'],
  ])('strips only leading frontmatter, retaining the body byte-for-byte', async (body, expected) => {
    const dir = await fixture();
    await writeFile(path.join(dir, 'agents/engineer-review.md'), body);
    expect((await resolveAssignment(request(), { root: dir })).roleContent.endsWith(expected)).toBe(true);
  });

  it.each(['---\nmodel: private\n# Missing closing fence', '---\nmodel: private\n---\n \n'])('fails closed on malformed or empty role content', async body => {
    const dir = await fixture();
    await writeFile(path.join(dir, 'agents/engineer-review.md'), body);
    await expect(readCatalogue({ root: dir })).rejects.toThrow(/frontmatter|empty/i);
  });
});

describe('neutral assignment resolution', () => {
  it.each(surfaces)('resolves baseline content on %s without execution or independent claims', async surface => {
    const assignment = await resolveAssignment(request({ surface }), { root });
    expect(assignment).toMatchObject({
      role: 'engineer-review', stage: '5_gofer_implement', surface,
      model: 'caller/model-a', mode: 'baseline', independent: false,
      requestedMode: 'baseline', executed: false, status: 'ready', dispatchAllowed: true,
    });
    expect(assignment.limitations.map((l: any) => l.code)).toEqual(expect.arrayContaining([
      'INDEPENDENT_READ_ISOLATION_UNQUALIFIED', 'INDEPENDENT_EXECUTION_UNQUALIFIED',
    ]));
    expect(assignment.roleContent).not.toContain('model: sonnet');
    expect(assignment.roleContent).toMatch(/provider-specific examples[\s\S]*non-authoritative/i);
    expect(assignment.scope).toEqual(['src', 'tests']);
    expect(assignment.requiredChecks).toEqual(['acceptance', 'security']);
    expect(assignment.binding.requiredChecks).toEqual(['acceptance', 'security']);
  });

  it('does not infer a model from role metadata or available model order', async () => {
    const assignment = await resolveAssignment(request({ model: undefined, availableModels: [] }));
    expect(assignment.model).toBeNull();
    expect(assignment).toMatchObject({ status: 'blocked', dispatchAllowed: false });
    expect(assignment.limitations.map((l: any) => l.code)).toContain('MODEL_NOT_SELECTED');
    expect((await resolveAssignment(request({ model: undefined }))).model).toBeNull();
  });

  it('labels embedded provider examples non-authoritative without changing responsibilities', async () => {
    const dir = await fixture();
    const body = '# Responsibilities\nReview every contract.\n\nTask({ model: "example-only", subagent_type: "review" })\n';
    await writeFile(path.join(dir, 'agents/engineer-review.md'), `---\nmodel: never-use\n---\n${body}`);
    const assignment = await resolveAssignment(request(), { root: dir });
    expect(assignment.roleContent).toContain('non-authoritative');
    expect(assignment.roleContent.indexOf('non-authoritative')).toBeLessThan(assignment.roleContent.indexOf('# Responsibilities'));
    expect(assignment.roleContent).toContain('do not select a model');
    expect(assignment.roleContent).toContain('Baseline work must never be described as independent');
    expect(assignment.roleContent.endsWith(body)).toBe(true);
    expect(assignment.model).toBe('caller/model-a');
    expect(assignment.contentPolicy.providerExamples).toBe('non-authoritative');
    expect(assignment.contentSha256).toBe(createHash('sha256').update(body).digest('hex'));
  });

  it.each([
    ['role', '../engineer-review'], ['role', 'unknown-role'], ['role', null],
    ['stage', 'unknown-stage'], ['stage', ''], ['stage', 5],
    ['task', ' '], ['task', null], ['task', 'bad\u0000task'],
    ['revision', ''], ['revision', 'bad revision'], ['revision', '../HEAD'],
    ['requiredChecks', undefined], ['requiredChecks', []], ['requiredChecks', ['']],
    ['requiredChecks', 'acceptance'], ['requiredChecks', ['a', 'a']],
    ['requiredChecks', Array.from({length: 257}, (_, i) => `check-${i}`)],
    ['requiredChecks', ['x'.repeat(1025)]],
    ['scope', []], ['scope', 'src'], ['scope', ['../src']], ['scope', ['/tmp']],
    ['scope', ['src/../tests']], ['scope', ['C:\\repo']], ['scope', ['src\\file']],
    ['scope', ['src', 'src']], ['scope', ['src//file']], ['scope', ['src/*']],
    ['surface', 'unknown'], ['surface', '__proto__'], ['mode', 'parallel'], ['mode', null],
    ['availableModels', undefined], ['availableModels', ['']], ['availableModels', [false]],
    ['availableModels', ['caller/model-a', 'caller/model-a']],
    ['model', 'not-available'], ['model', 'sonnet'],
    ['capabilities', { independentExecution: 'true' }], ['capabilities', null],
  ])('rejects invalid %s = %j', async (field, value) => {
    await expect(resolveAssignment(request({ [field]: value }))).rejects.toThrow();
  });

  it('does not promote capability self-declarations or unverified native claims', async () => {
    const assignment = await resolveAssignment(request({
      mode: 'independent', capabilities: { independentReadIsolation: true, independentExecution: true },
      nativeProof: { kind: 'native-proof', verified: true },
    }));
    expect(assignment).toMatchObject({ mode: 'blocked', independent: false, requestedMode: 'independent', status: 'blocked', dispatchAllowed: false });
    expect(assignment.qualification).toMatchObject({ evidenceKind: 'unqualified', declarations: {
      independentReadIsolation: true, independentExecution: true,
    } });
    expect(assignment.limitations.map((l: any) => l.code)).toContain('NATIVE_PROOF_UNVERIFIED');
  });

  async function proofRequest() {
    const base = await resolveAssignment(request());
    return request({ mode: 'independent', nativeProof: {
      kind: 'native-proof', binding: base.binding, evidence: ['host-run:123'],
      independentReadIsolation: true, independentExecution: true,
    } });
  }

  it('qualifies only exact assignment-bound native proof approved by the trusted host verifier', async () => {
    const input = await proofRequest();
    const verifier = vi.fn(async () => true);
    const assignment = await resolveAssignment(input, { verifyNativeProof: verifier });
    expect(verifier).toHaveBeenCalledWith(input.nativeProof, assignment.binding);
    expect(assignment).toMatchObject({ mode: 'independent', independent: true, executed: false, status: 'ready', dispatchAllowed: true });
    expect(assignment.qualification.evidenceKind).toBe('native-proof');
    expect(assignment.limitations).toEqual([]);
    expect((await resolveAssignment({ ...input, mode: 'baseline' }, { verifyNativeProof: verifier })).independent).toBe(false);
  });

  it.each(['role', 'stage', 'task', 'revision', 'scope', 'surface', 'model', 'contentSha256', 'requiredChecks'])('rejects stale native proof binding: %s', async field => {
    const input = await proofRequest();
    (input.nativeProof as any).binding[field] = field === 'scope' ? ['other'] : 'other';
    const verifier = vi.fn(() => true);
    const assignment = await resolveAssignment(input, { verifyNativeProof: verifier });
    expect(assignment.independent).toBe(false);
    expect(assignment).toMatchObject({ mode: 'blocked', status: 'blocked', dispatchAllowed: false });
    expect(verifier).not.toHaveBeenCalled();
  });

  it.each([
    () => false, () => 'true', () => { throw new Error('Host unavailable'); },
  ])('fails closed when the trusted verifier does not return true', async verifier => {
    const assignment = await resolveAssignment(await proofRequest(), { verifyNativeProof: verifier });
    expect(assignment.independent).toBe(false);
    expect(assignment).toMatchObject({ mode: 'blocked', status: 'blocked', dispatchAllowed: false });
    expect(assignment.limitations.length).toBeGreaterThan(0);
  });

  it.each(['independentReadIsolation', 'independentExecution'])('requires native proof of %s, not just the other capability', async capability => {
    const input = await proofRequest();
    (input.nativeProof as any)[capability] = false;
    const assignment = await resolveAssignment(input, { verifyNativeProof: () => true });
    expect(assignment.independent).toBe(false);
    expect(assignment).toMatchObject({ mode: 'blocked', status: 'blocked', dispatchAllowed: false });
  });

  it('blocks an independent request without a selected model even if both native capabilities are verified', async () => {
    const base = await resolveAssignment(request({ model: undefined }));
    const assignment = await resolveAssignment(request({ mode: 'independent', model: undefined, nativeProof: {
      kind: 'native-proof', binding: base.binding, evidence: ['host-run:123'],
      independentReadIsolation: true, independentExecution: true,
    } }), { verifyNativeProof: () => true });
    expect(assignment).toMatchObject({ mode: 'blocked', status: 'blocked', dispatchAllowed: false, independent: false });
    expect(assignment.limitations.map((l: any) => l.code)).toContain('MODEL_NOT_SELECTED');
  });

  it('does not silently downgrade an independent request to a dispatchable baseline', async () => {
    const assignment = await resolveAssignment(request({ mode: 'independent' }));
    expect(assignment).toMatchObject({ mode: 'blocked', requestedMode: 'independent', status: 'blocked', dispatchAllowed: false, independent: false });
    expect((await resolveAssignment(request({ mode: 'baseline' })))).toMatchObject({ mode: 'baseline', status: 'ready', dispatchAllowed: true, independent: false });
  });

  it('does not mutate caller input or retain mutable catalogue state between calls', async () => {
    const input = request();
    const before = structuredClone(input);
    const result = await resolveAssignment(input);
    result.scope.push('unapproved');
    result.requiredChecks.push('unapproved');
    expect(result.binding.requiredChecks).toEqual(['acceptance', 'security']);
    expect(input).toEqual(before);
    const catalogue = await readCatalogue();
    catalogue.roles[0].content = 'tampered';
    expect((await readCatalogue()).roles[0].content).not.toBe('tampered');
  });
});

describe('read-only CLI', () => {
  it('supports --help without relying on the current directory', () => {
    const output = execFileSync(process.execPath, [path.join(root, helper), '--help'], { cwd: os.tmpdir(), encoding: 'utf8' });
    expect(output).toContain('--list');
    expect(output).toContain('--json');
    expect(output).toMatch(/read-only/i);
  });

  it('lists JSON from a relocated, dependency-free package using module-relative paths', async () => {
    const dir = await fixture();
    const output = execFileSync(process.execPath, [path.join(dir, helper), '--list', '--json'], { cwd: os.tmpdir(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    const catalogue = JSON.parse(output);
    expect(catalogue.roles).toHaveLength(42);
    expect(catalogue.roles.every((r: any) => r.source.startsWith('agents/'))).toBe(true);
    expect(catalogue.roles.find((r: any) => r.id === 'engineer-review').content).not.toContain('model: sonnet');
  });

  it('lists role ids in plain text', () => {
    const output = execFileSync(process.execPath, [path.join(root, helper), '--list'], { encoding: 'utf8' });
    expect(output.trim().split('\n')).toHaveLength(42);
    expect(output).toContain('engineer-review');
  });

  it.each([[], ['--json'], ['--launch'], ['--list', '--model', 'anything'], ['--list', '--list']].map(args => ({ args })))('rejects unsupported CLI arguments: $args', ({ args }) => {
    const result = spawnSync(process.execPath, [path.join(root, helper), ...args], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/usage|unsupported|argument/i);
  });
});
