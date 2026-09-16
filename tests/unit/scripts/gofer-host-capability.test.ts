import { describe, expect, it } from 'vitest';
import { HOSTS, HOST_ALIASES, createCapabilityReceipt, inspectHost, selectLiveModel } from '../../../.specify/scripts/node/gofer-host-capability.mjs';

describe('Gofer host capability discovery', () => {
  it('does not guess a host or model when auto detection lacks a runtime signal', async () => {
    await expect(inspectHost('auto')).resolves.toMatchObject({
      status: 'host-name-required', models: [], modelDiscovery: 'host-runtime-required',
    });
  });

  it('records only an executable probe, not model or isolation qualification', async () => {
    const result = await inspectHost('codex', { run: async () => ({ ok: true, version: 'codex 1.2.3' }) });
    expect(result).toMatchObject({ host: 'codex', status: 'available', version: 'codex 1.2.3', models: [], independentExecution: 'unqualified' });
  });

  it('does not substitute a different host when a requested host is unavailable', async () => {
    const result = await inspectHost('claude', { run: async () => ({ ok: false, version: null }) });
    expect(result).toMatchObject({ host: 'claude', status: 'unavailable' });
  });

  it('rejects unknown host names', async () => {
    await expect(inspectHost('made-up')).rejects.toThrow('unsupported host');
  });

  it('uses one canonical host identity and executable across all aliases', async () => {
    for (const [alias, canonical] of Object.entries(HOST_ALIASES)) {
      const result = await inspectHost(alias, { run: async () => ({ ok: true, version: 'available' }) });
      expect(result.host).toBe(canonical);
      expect(result.executable).toBe(HOSTS[canonical].program);
    }
    expect(HOSTS.antigravity.program).toBe('agy');
  });

  it('selects models only from a fresh, host-bound evaluation receipt', () => {
    const receipt = createCapabilityReceipt({ host: 'openai-codex', evaluatorVersion: '1.0.0',
      evaluationId: 'eval-1', evaluatedAt: '2026-09-17T00:00:00.000Z', expiresAt: '2026-09-18T00:00:00.000Z',
      models: [{ id: 'gpt-current', reasoningEfforts: ['low', 'high'] }] });
    expect(selectLiveModel(receipt, { host: 'codex', modelId: 'gpt-current', now: Date.parse('2026-09-17T12:00:00Z') }))
      .toMatchObject({ host: 'codex', evaluationId: 'eval-1', model: { id: 'gpt-current' } });
    expect(() => selectLiveModel(receipt, { host: 'claude', modelId: 'gpt-current' })).toThrow('unavailable');
    expect(() => selectLiveModel(receipt, { host: 'codex', modelId: 'missing' })).toThrow('current host receipt');
  });
});
