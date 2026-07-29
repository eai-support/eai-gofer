import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  validateSourceContent,
  validateWorkspace,
} from '../../../.specify/scripts/node/validate-v4-resource-contract.mjs';

const temporaryWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces
      .splice(0)
      .map((workspace) => rm(workspace, { recursive: true, force: true }))
  );
});

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
      await platformFetch(
        \`/api/eai/v4/data/resources/\${tenant}/operations/reindex\`,
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
      await fetch<Response>(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
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

  it('rejects POST create envelopes on member resource routes', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      await platformFetch(this.resourceUrl(objectType, id), {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      await fetch(\`/v4/data/resources/project/\${id}\`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
    `;

    expect(validateSourceContent(invalid, 'src/client.ts')).toEqual([
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_METHOD_REQUIRED' }),
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_METHOD_REQUIRED' }),
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_METHOD_REQUIRED' }),
    ]);
  });

  it('rejects envelope keys that only exist in nested objects', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/project\`, {
        method: 'POST',
        body: JSON.stringify({ wrapper: { data } }),
      });
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'PUT',
        body: JSON.stringify({ wrapper: { data }, version }),
      });
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}/actions/approve\`, {
        method: 'POST',
        body: JSON.stringify({ wrapper: { params } }),
      });
    `;

    const result = validateSourceContent(invalid, 'src/client.ts');
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.ruleId === 'EAI_V4_RESOURCE_ENVELOPE_REQUIRED')).toBe(true);
  });

  it('requires params rather than data for tenant resource operations', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/operations/reindex\`, {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
    `;

    expect(validateSourceContent(invalid, 'src/client.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'EAI_V4_RESOURCE_ENVELOPE_REQUIRED',
        message: expect.stringContaining('operation'),
      }),
    ]);
  });

  it('resolves bound resource URLs and fails closed on dynamic methods or helpers', () => {
    const invalid = `
      const patchedUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await fetch(patchedUrl, { method: 'PATCH', body: JSON.stringify(data) });

      const dynamicUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await fetch(dynamicUrl, { method: mutationMethod, body: JSON.stringify({ data, version }) });

      const optionsUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await fetch(optionsUrl, mutationOptions);

      const spreadUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await fetch(spreadUrl, { ...mutationOptions });

      const shorthandUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await fetch(shorthandUrl, { method, body });

      const helperUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await http.request(helperUrl, { method: 'PUT', body: JSON.stringify({ data, version }) });

      const shorthandHelperUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await http.request(shorthandHelperUrl, { method, body });

      const indirectHelperUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await http.request(indirectHelperUrl, mutationOptions);

      const opaqueHelperUrl = \`/v4/data/resources/\${tenant}/project/\${id}\`;
      await request(opaqueHelperUrl);

      await platformFetch(buildResourceUrl(tenant, 'project', id), {
        method: 'PUT',
        body: JSON.stringify({ data, version }),
      });

      const constructedUrl = new URL(
        \`/v4/data/resources/\${tenant}/project/\${id}\`,
        'https://example.test',
      );

      metrics.record(opaqueHelperUrl);
    `;

    expect(validateSourceContent(invalid, 'src/client.ts').map((item) => item.ruleId)).toEqual([
      'EAI_V4_RESOURCE_PATCH_FORBIDDEN',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
      'EAI_V4_RESOURCE_PATTERN_UNRESOLVED',
    ]);
  });

  it('inspects the body property instead of unrelated JSON serialization', () => {
    const invalid = `
      await fetch(\`/v4/data/resources/\${tenant}/project/\${id}\`, {
        method: 'PUT',
        headers: { 'x-debug': JSON.stringify({ data, version }) },
        body: JSON.stringify(data),
      });
    `;

    expect(validateSourceContent(invalid, 'src/client.ts')).toEqual([
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_ENVELOPE_REQUIRED' }),
    ]);
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

  it('accepts typed, multiline, wrapped, and reassigned action result bindings', () => {
    const valid = `
      async function approveAndEdit() {
        const acted:
          {
            data: Record<string, unknown>;
            version: number;
            intentionallyLongMetadataFieldToExceedTheFormerLookbackWindow: string;
          } =
          await (
            resources
          ).executeAction('Project', id, 'approve', {});
        await resources.update('Project', id, acted.data, ((acted.version)));

        let reassigned;
        reassigned = await resources.executeAction('Project', id, 'archive', {});
        await resources.update('Project', id, reassigned.data, reassigned.version);
      }
    `;

    expect(validateSourceContent(valid, 'src/flow.ts')).toEqual([]);
  });

  it('accepts destructured and locally aliased action result versions', () => {
    const valid = `
      async function approveWithDestructuring() {
        const { data, version: actionVersion } =
          await resources.executeAction('Project', id, 'approve', {});
        await resources.update('Project', id, data, actionVersion);
      }

      async function approveWithAlias() {
        const acted = await resources.executeAction('Project', id, 'approve', {});
        const nextVersion: number = acted.version;
        await resources.update('Project', id, acted.data, nextVersion);
      }

      async function approveWithLaterDestructuring() {
        const acted = await resources.executeAction('Project', id, 'approve', {});
        const { version } = acted;
        const currentVersion = version;
        await resources.update('Project', id, acted.data, currentVersion);
      }
    `;

    expect(validateSourceContent(valid, 'src/flow.ts')).toEqual([]);
  });

  it('checks the update version argument even after updateFrom or unrelated version use', () => {
    const invalid = `
      async function approveAndEdit() {
        const acted = await resources.executeAction('Project', id, 'approve', {});
        await resources.updateFrom('Project', acted, acted.data);
        await resources.update('Project', id, data, oldVersion);
        console.log(acted.version);
      }
    `;

    expect(validateSourceContent(invalid, 'src/flow.ts')).toEqual([
      expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_STALE_VERSION_FLOW' }),
    ]);
  });

  it('ignores updates made through a different client after an action', () => {
    const valid = `
      async function approveAndAudit() {
        await resources.executeAction('Project', id, 'approve', {});
        await auditLog.update('Audit', auditId, data, version);
      }
    `;

    expect(validateSourceContent(valid, 'src/flow.ts')).toEqual([]);
  });

  it('ignores mutation examples contained only in comments or strings', () => {
    const valid = `
      // fetch('/v4/data/resources/tenant/project/id', { method: 'PATCH' });
      const example = "fetch('/v4/data/resources/tenant/project/id', { method: 'PATCH' })";
      const docs = \`
        fetch('/v4/data/resources/tenant/project/id', {
          method: 'PUT',
          body: JSON.stringify(data),
        })
      \`;
    `;

    expect(validateSourceContent(valid, 'src/docs.ts')).toEqual([]);
  });

  it('scans source files while excluding tests and dependency directories', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'gofer-v4-contract-'));
    temporaryWorkspaces.push(workspace);
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await mkdir(path.join(workspace, 'tests'), { recursive: true });
    await mkdir(path.join(workspace, 'node_modules', 'fixture'), { recursive: true });
    const invalid = `
      fetch('/v4/data/resources/tenant/project/id', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    `;
    await writeFile(path.join(workspace, 'src', 'client.ts'), invalid);
    await writeFile(path.join(workspace, 'tests', 'client.test.ts'), invalid);
    await writeFile(path.join(workspace, 'node_modules', 'fixture', 'index.js'), invalid);

    const result = await validateWorkspace(workspace);

    expect(result.filesScanned).toBe(1);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: path.join('src', 'client.ts'),
        ruleId: 'EAI_V4_RESOURCE_PATCH_FORBIDDEN',
      }),
    ]);
  });

  it('returns machine-readable JSON and a failing exit code from the CLI', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'gofer-v4-contract-cli-'));
    temporaryWorkspaces.push(workspace);
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await writeFile(
      path.join(workspace, 'src', 'client.ts'),
      `fetch('/v4/data/resources/tenant/project/id', { method: 'PATCH' });`
    );
    const script = path.resolve('.specify/scripts/node/validate-v4-resource-contract.mjs');

    const result = spawnSync(process.execPath, [script, '--workspace', workspace, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        valid: false,
        violations: [expect.objectContaining({ ruleId: 'EAI_V4_RESOURCE_PATCH_FORBIDDEN' })],
      })
    );
  });
});
