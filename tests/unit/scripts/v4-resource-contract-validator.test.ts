import { describe, expect, it } from 'vitest';

import { validateSourceContent } from '../../../.specify/scripts/node/validate-v4-resource-contract.mjs';

describe('PublicAPI v4 resource mutation contract validator', () => {
  it('accepts canonical create, update, action, and updateFrom calls', () => {
    const source = `
      await platformFetch(\`/api/eai/v4/data/resources/\${tenant}/project\`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      await platformFetch(\`/api/eai/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'PUT',
        body: JSON.stringify({ data, version }),
      });
      const acted = await resources.executeAction('Project', id, 'approve', {});
      await resources.updateFrom('Project', acted, { ...acted.data, note: 'checked' });
      await platformFetch(
        \`/api/eai/v4/data/resources/\${tenant}/project/\${id}/actions/approve\`,
        { method: 'POST', body: JSON.stringify({ params }) },
      );
    `;

    expect(validateSourceContent(source, 'src/client.ts')).toEqual([]);
  });

  it('rejects PATCH resource record updates but permits Object Type PATCH', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      await fetch('/v4/data/resources/object-types/type-id', {
        method: 'PATCH',
        body: JSON.stringify(definition),
      });
    `;

    expect(validateSourceContent(invalid, 'src/client.ts')).toEqual([
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_PATCH_FORBIDDEN' }),
    ]);
  });

  it('rejects flat create, update, and action bodies', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/project\`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}/actions/approve\`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    `;

    const result = validateSourceContent(invalid, 'src/client.ts');
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.ruleId === 'EAI_V4_RESOURCE_ENVELOPE_REQUIRED')).toBe(true);
  });

  it('rejects action-followed-by-update when the old version is reused', () => {
    const invalid = `
      async function approveAndEdit() {
        await resources.executeAction('Project', id, 'approve', {});
        await resources.update('Project', id, data, version);
      }
    `;

    expect(validateSourceContent(invalid, 'src/flow.ts')).toEqual([
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_STALE_VERSION_FLOW' }),
    ]);
  });

  it('accepts an explicit action result version in a follow-up update', () => {
    const valid = `
      async function approveAndEdit() {
        const acted = await resources.executeAction('Project', id, 'approve', {});
        await resources.update('Project', id, { ...acted.data, note: 'checked' }, acted.version);
      }
    `;

    expect(validateSourceContent(valid, 'src/flow.ts')).toEqual([]);
  });
});
