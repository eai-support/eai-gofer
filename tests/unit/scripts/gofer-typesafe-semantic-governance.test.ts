import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const credentialsUrl = new URL('../../../.specify/scripts/node/gofer-typesafe-credentials.mjs', import.meta.url);
const semanticUrl = new URL('../../../.specify/scripts/node/gofer-semantic-drift.mjs', import.meta.url);
const directories: string[] = [];

async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-'));
  directories.push(workspace);
  const featureDir = path.join(workspace, '.specify', 'specs', '002-typesafe');
  await mkdir(path.join(workspace, '.specify', 'config'), { recursive: true });
  await mkdir(featureDir, { recursive: true });
  await writeFile(path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'), JSON.stringify({ schemaVersion: 1, enabled: false, provider: 'typesafe', events: ['before_validation'], minimumConfidence: 0.85, uncertainAction: 'reconcile', conflictAction: 'block_affected_task' }));
  await writeFile(path.join(featureDir, 'goal-ledger.json'), '{"goal":"deliver"}');
  await writeFile(path.join(featureDir, 'spec.md'), '# Spec');
  return { workspace, featureDir };
}

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('TypeSafe semantic governance', () => {
  it('writes only an ignored project secret file and enables review', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    expect(await readFile(path.join(workspace, '.specify', 'secrets', 'typesafe.env'), 'utf8')).toBe('TYPESAFE_API_KEY=secret-value\n');
    expect(JSON.parse(await readFile(path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'), 'utf8')).enabled).toBe(true);
    const result = await credentials.disconnect({ workspace });
    expect(result.removedProjectSecret).toBe(true);
    expect(JSON.parse(await readFile(path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'), 'utf8')).enabled).toBe(false);
  });

  it('does not call the provider when review is disabled or no credential exists', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const fetchImpl = vi.fn();
    expect(await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })).toMatchObject({ status: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const policyPath = path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8')); policy.enabled = true; await writeFile(policyPath, JSON.stringify(policy));
    expect(await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })).toMatchObject({ status: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes a hash-bound receipt and blocks a provider conflict', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'conflict', confidence: 0.99 }, required_action: { choice: 'ask_user', confidence: 0.99 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result).toMatchObject({ status: 'conflict', confidence: 0.99 });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer secret-value');
    const receipt = JSON.parse(await readFile(path.join(featureDir, 'evidence', 'semantic-review', 'before_validation.json'), 'utf8'));
    expect(receipt.artifacts['spec.md']).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain('secret-value');
  });

  it('reports unavailable, not an uncaught exception, on a network failure or timeout', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const networkFailure = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl: networkFailure })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'network_error' });
    const timeout = vi.fn(async () => { const error = new Error('The operation was aborted'); error.name = 'TimeoutError'; throw error; });
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl: timeout })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'timeout' });
  });

  it('fails toward reconcile, not a silent aligned pass, on an unrecognized provider answer', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'unclear', confidence: 0.99 }, required_action: { choice: 'continue', confidence: 0.99 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.status).toBe('reconcile');
  });

  it('reports unavailable on a response body that is not valid JSON', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_body' });
  });

  it('reports aligned when confidence is high and both answers are recognized', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 0.95 }, required_action: { choice: 'continue', confidence: 0.95 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.status).toBe('aligned');
  });

  it('rejects a feature directory that escapes the workspace', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-outside-'));
    directories.push(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'do not read this');
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir: outside, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('must remain inside the workspace');
    await expect(
      semantic.runSemanticReview({ workspace, featureDir: path.join(workspace, '..', 'escape'), event: 'before_validation', fetchImpl })
    ).rejects.toThrow('must remain inside the workspace');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('binds the receipt hash to the full artifact content, not the truncated slice sent to the provider', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const oversized = `${'a'.repeat(64 * 1024)}TAIL_DRIFT_MARKER`;
    await writeFile(path.join(featureDir, 'spec.md'), oversized);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 0.95 }, required_action: { choice: 'continue', confidence: 0.95 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.artifacts['spec.md']).toBe(createHash('sha256').update(oversized).digest('hex'));
    const sentBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const sentState = JSON.parse(sentBody.state);
    expect(sentState['spec.md'].content.length).toBe(64 * 1024);
    expect(sentState['spec.md'].content).not.toContain('TAIL_DRIFT_MARKER');
  });

  it('rejects a credential path routed through a symlinked directory', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-secrets-'));
    directories.push(outside);
    await symlink(outside, path.join(workspace, '.specify', 'secrets'));
    await expect(credentials.connect({ workspace, key: 'secret-value' })).rejects.toThrow('symbolic link');
  });

  it('fails closed when an enabled policy has a missing or invalid minimumConfidence', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn();
    const policyPath = path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json');
    for (const malformed of [
      { schemaVersion: 1, enabled: true, provider: 'typesafe', events: ['before_validation'] },
      { schemaVersion: 1, enabled: true, provider: 'typesafe', events: ['before_validation'], minimumConfidence: 'high' },
      { schemaVersion: 1, enabled: true, provider: 'typesafe', events: ['before_validation'], minimumConfidence: 1.5 },
      { schemaVersion: 1, enabled: true, provider: 'typesafe', events: 'before_validation', minimumConfidence: 0.85 },
    ]) {
      await writeFile(policyPath, JSON.stringify(malformed));
      await expect(
        semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
      ).rejects.toThrow('malformed');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a symlinked policy config directory', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-config-'));
    directories.push(outside);
    await writeFile(path.join(outside, 'typesafe-semantic-review.json'), JSON.stringify({ schemaVersion: 1, enabled: true, provider: 'typesafe', events: ['before_validation'], minimumConfidence: 0.85 }));
    await rm(path.join(workspace, '.specify', 'config'), { recursive: true, force: true });
    await symlink(outside, path.join(workspace, '.specify', 'config'));
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('symbolic link');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prefers the environment key over a conflicting project secret file', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    await credentials.connect({ workspace, key: 'project-secret-value' });
    const result = await credentials.resolveApiKey({ workspace, env: { TYPESAFE_API_KEY: 'environment-value' } });
    expect(result).toEqual({ apiKey: 'environment-value', source: 'environment' });
  });

  it('treats an invalid confidence as zero instead of dropping it', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    // A malformed confidence on one answer must not be outweighed by a high
    // confidence on the other: the minimum must still fail closed to zero.
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 'not-a-number' }, required_action: { choice: 'continue', confidence: 0.99 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.confidence).toBe(0);
    expect(result.status).toBe('reconcile');
  });

  it('maps each status to the exit code a CI caller must not read as a pass', async () => {
    const semantic = await import(semanticUrl.href);
    expect(semantic.exitCodeForStatus('conflict')).toBe(2);
    expect(semantic.exitCodeForStatus('reconcile')).toBe(3);
    expect(semantic.exitCodeForStatus('unavailable')).toBe(3);
    expect(semantic.exitCodeForStatus('not_configured')).toBe(3);
    expect(semantic.exitCodeForStatus('aligned')).toBe(0);
    expect(semantic.exitCodeForStatus('disabled')).toBe(0);
  });

  it('rejects a feature directory whose own path is a symlink', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-feature-'));
    directories.push(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'do not read this');
    const linkedFeatureDir = path.join(workspace, '.specify', 'specs', 'linked-feature');
    await symlink(outside, linkedFeatureDir);
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir: linkedFeatureDir, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('symbolic link');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a nonexistent feature directory instead of an empty state', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir: path.join(workspace, '.specify', 'specs', 'typo-d-feature'), event: 'before_validation', fetchImpl })
    ).rejects.toThrow('does not exist');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats an out-of-range confidence as zero, not a satisfied minimum', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 2 }, required_action: { choice: 'continue', confidence: 0.99 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.confidence).toBe(0);
    expect(result.status).toBe('reconcile');
  });

  it('rejects an artifact larger than the maximum readable size', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(9 * 1024 * 1024));
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('exceeds the maximum readable size');
  });

  it('records missing artifacts in the receipt without blocking early-stage documents', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 0.95 }, required_action: { choice: 'continue', confidence: 0.95 } } }), { status: 200 }));
    const result = await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    expect(result.missingArtifacts).toEqual(expect.arrayContaining(['plan.md', 'tasks.md', 'decisions.md', 'traceability.md']));
    expect(result.status).toBe('aligned');
  });

  it('truncates the sent artifact by UTF-8 bytes, not UTF-16 code units', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    // Each euro sign is 1 UTF-16 code unit but 3 UTF-8 bytes: a code-unit
    // truncation would let this through far past the 64 KiB byte bound.
    const oversized = '€'.repeat(64 * 1024);
    await writeFile(path.join(featureDir, 'spec.md'), oversized, 'utf8');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: { goal_alignment: { choice: 'aligned', confidence: 0.95 }, required_action: { choice: 'continue', confidence: 0.95 } } }), { status: 200 }));
    await semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl });
    const sentBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const sentState = JSON.parse(sentBody.state);
    expect(Buffer.byteLength(sentState['spec.md'].content, 'utf8')).toBeLessThanOrEqual(64 * 1024);
  });
});
