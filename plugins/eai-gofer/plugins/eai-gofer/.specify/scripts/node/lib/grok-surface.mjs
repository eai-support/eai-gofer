/** Read discovery metadata only. Never expose account, hook or MCP configuration. */
export async function inspectGrok(execute) {
  const result = {
    host: 'grok', status: 'unverified', available: null, installed: null,
    discoveryRead: false, executionVerified: false,
  };
  const options = { shell: false, windowsHide: true, timeout: 10000, maxBuffer: 4194304 };
  try {
    const { stdout } = await execute('grok', ['--version'], options);
    const version = /^grok (\d+\.\d+\.\d+)(?: \([a-f\d]+\))?\s*$/.exec(stdout);
    if (!version) throw new Error('Unrecognized client');
    result.available = true;
    result.version = version[1];
    const inspection = await execute('grok', ['inspect', '--json'], options);
    const data = JSON.parse(inspection.stdout);
    if (data.grokVersion !== result.version || !Array.isArray(data.skills)
      || !Array.isArray(data.plugins) || !Array.isArray(data.hooks)
      || typeof data.projectTrusted !== 'boolean'
      || data.skills.some((s) => !s || typeof s.name !== 'string' || typeof s.userInvocable !== 'boolean'
        || !s.source || typeof s.source.type !== 'string')
      || data.plugins.some((p) => !p || typeof p.name !== 'string' || typeof p.enabled !== 'boolean')) {
      throw new Error('Unrecognized discovery');
    }
    const publicSkills = ['eai', 'eai-update'].map((name) => {
      const matches = data.skills.filter((s) => s.name === name && s.userInvocable);
      return { name, discovered: matches.length === 1, matches: matches.length,
        sourceKind: matches.length === 1 && ['project', 'user', 'plugin'].includes(matches[0].source.type)
          ? matches[0].source.type : 'unknown' };
    });
    const legacyEntries = data.skills.filter((s) => s.userInvocable
      && /^(?:eai-gofer|gofer|\d+[a-z]?_gofer_.*|0_business_scenario|0a_problem_validation|gofer[:_].*)$/.test(s.name)).length;
    return { ...result, discoveryRead: true,
      installed: data.plugins.some((p) => p.name === 'eai-gofer' && p.enabled),
      publicSkills, legacyEntries, hookCount: data.hooks.length, projectTrusted: data.projectTrusted,
      reason: 'Discovery only; model execution, permissions and updates require separate tests.',
      guidance: legacyEntries > 0
        ? 'Older Gofer entries are also loaded. Inspect their source before cleanup; never delete another host plugin automatically.'
        : 'Verify both skills in this workspace before claiming /eai works. CLI discovery does not establish Grok Bot support.' };
  } catch {
    return { ...result, reason: 'Could not verify Grok Build discovery. No settings changed and no model was called.' };
  }
}
