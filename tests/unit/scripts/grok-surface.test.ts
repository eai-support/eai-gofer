import { describe, it, expect, vi } from 'vitest';

const moduleUrl = new URL('../../../.specify/scripts/node/lib/grok-surface.mjs', import.meta.url);
const fixture = () => ({
  grokVersion: '1.0.13',
  projectTrusted: true,
  hooks: [],
  plugins: [],
  skills: ['eai', 'eai-update'].map((name) => ({
    name,
    userInvocable: true,
    source: { type: 'project' },
  })),
});

describe('Grok Build discovery is not desktop or execution proof', () => {
  async function inspect(data: unknown) {
    const { inspectGrok } = await import(moduleUrl.href);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'grok 1.0.13 (5e9a58528b76)\n' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(data) });
    return { result: await inspectGrok(execute), execute };
  }

  it('finds repo skills without claiming a plugin is installed or models ran', async () => {
    const { result, execute } = await inspect(fixture());
    expect(result).toMatchObject({
      available: true,
      installed: false,
      discoveryRead: true,
      executionVerified: false,
    });
    expect(result.publicSkills).toEqual(
      ['eai', 'eai-update'].map((name) => ({
        name,
        discovered: true,
        matches: 1,
        sourceKind: 'project',
      }))
    );
    expect(execute.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ['grok', ['--version']],
      ['grok', ['inspect', '--json']],
    ]);
    expect(execute.mock.calls[1][2]).toMatchObject({
      shell: false,
      timeout: 10000,
      maxBuffer: 4194304,
    });
  });

  it('warns about legacy entries without printing private configuration', async () => {
    const data = {
      ...fixture(),
      hooks: [{ target: 'private-secret' }],
      configSources: { secret: 'private-secret' },
      plugins: [{ name: 'eai-gofer', enabled: true, path: 'private-secret' }],
      skills: [
        ...fixture().skills,
        {
          name: 'eai-gofer',
          userInvocable: true,
          source: { type: 'plugin', path: 'private-secret' },
        },
      ],
    };
    const { result } = await inspect(data);
    expect(result).toMatchObject({ installed: true, legacyEntries: 1, hookCount: 1 });
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });

  it('does not certify duplicate or hidden public entries', async () => {
    const data = fixture();
    data.skills.push(data.skills[0]);
    data.skills[1].userInvocable = false;
    const { result } = await inspect(data);
    expect(result.publicSkills.every((s: { discovered: boolean }) => !s.discovered)).toBe(true);
  });

  it.each([
    null,
    {},
    { ...fixture(), grokVersion: '2.0.0' },
    { ...fixture(), skills: [null] },
    { ...fixture(), plugins: [{ name: 'eai-gofer', enabled: 'true' }] },
    { ...fixture(), hooks: null },
  ])('fails closed on unknown discovery shapes', async (data) => {
    const { result } = await inspect(data);
    expect(result).toMatchObject({
      available: true,
      installed: null,
      discoveryRead: false,
      executionVerified: false,
    });
  });

  it('redacts process errors and does not guess availability', async () => {
    const { inspectGrok } = await import(moduleUrl.href);
    const execute = vi.fn().mockRejectedValue(new Error('private-secret'));
    const result = await inspectGrok(execute);
    expect(result).toMatchObject({ available: null, installed: null, discoveryRead: false });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
