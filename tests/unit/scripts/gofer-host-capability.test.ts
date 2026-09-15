import { describe, expect, it } from 'vitest';
import { inspectHost } from '../../../.specify/scripts/node/gofer-host-capability.mjs';

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
});
