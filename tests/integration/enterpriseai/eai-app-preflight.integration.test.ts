import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('enterpriseai eai app delivery preflight (root integration)', () => {
  it('gates EAI app delivery before journey mapping and implementation planning', () => {
    const scenarioCommand = readRepoFile('.specify/commands/0_gofer_start.md');
    const researchCommand = readRepoFile('.specify/commands/1_gofer_research.md');
    const specifyCommand = readRepoFile('.specify/commands/2_gofer_specify.md');
    const planCommand = readRepoFile('.specify/commands/3_gofer_plan.md');
    const tasksCommand = readRepoFile('.specify/commands/4_gofer_tasks.md');
    const implementCommand = readRepoFile('.specify/commands/5_gofer_implement.md');

    expect(scenarioCommand).toContain('EAI App Delivery Preflight');
    expect(scenarioCommand).toContain('EAI Platform And Azure App Stack Policy');
    expect(scenarioCommand).toContain('EAI Platform first, including the EAI app template');
    expect(scenarioCommand).toMatch(
      /App delivery in EAI Gofer means EAI Platform\s+delivery by default/
    );
    expect(scenarioCommand).toContain('/gofer:eai-first-run');
    expect(scenarioCommand).toContain('npm install -g eai-cli');
    expect(scenarioCommand).toContain('eai update --check');
    expect(scenarioCommand).toContain('eai login');
    expect(scenarioCommand).toContain('eai tenant list --format json');
    expect(scenarioCommand).toContain('eai init <app-name>');
    expect(scenarioCommand).toContain(
      'node .specify/scripts/node/eai-app-template-readiness.mjs --root .'
    );
    expect(scenarioCommand).toContain('any status other than `ready` is a hard stop');
    expect(scenarioCommand).toContain('Do not accept copied marker files');
    expect(scenarioCommand).toContain('eai template check --format json');
    expect(scenarioCommand).toMatch(/eai gofer\s+refresh --check\s+--format json/);
    expect(scenarioCommand).toContain('eai workflow readiness --format json');
    expect(scenarioCommand).toContain('eai app create <name>');
    expect(scenarioCommand).toContain(
      'eai app provision <key> --tenant-id <tenant-id> --select --format json'
    );
    expect(scenarioCommand).toContain('The EAI CLI is the only app-manifest request serializer');
    expect(scenarioCommand).toContain('Apply one Object Type identifier contract everywhere');
    expect(scenarioCommand).toContain('Curate resource routes');
    expect(scenarioCommand).toContain('The CLI sends explicit `name` plus `slug` first');
    expect(scenarioCommand).toContain(
      'eai types seed --tenant-key <key> --tenant-id <tenant-id> --dry-run --format json'
    );
    expect(scenarioCommand).toContain('AADSTS50011');
    expect(scenarioCommand).toContain('EAI_ENTRA_REDIRECT_URI_MISMATCH');
    expect(scenarioCommand).toMatch(
      /eai provision entra --force\s+--redirect-uri\s+<confirmed-callback-uri>/
    );
    expect(scenarioCommand).toContain(
      'Never write exact private URLs, tenant IDs, client IDs, tokens, or debug output'
    );
    expect(scenarioCommand).toContain(
      'eai resources storage doctor --tenant-id <tenant-id> --format json'
    );
    expect(scenarioCommand).toContain('.specify/references/platform/eai-repo-contract.md');
    expect(scenarioCommand).toContain('.specify/references/platform/eai-error-catalog.yaml');
    expect(scenarioCommand).toContain('.specify/specs/{feature}/eai-preflight.md');

    expect(researchCommand).toContain('eai-preflight.md');
    expect(researchCommand).toContain('EAI preflight summary');
    expect(researchCommand).toContain('last completed gate');
    expect(researchCommand).toContain('blocked gate');
    expect(researchCommand).toContain('workflow readiness');
    expect(researchCommand).toContain('src/eai.config/object-types.ts');
    expect(researchCommand).toContain('eai blocks readiness');
    expect(researchCommand).toContain('EAI Platform/Azure stack fit');
    expect(researchCommand).toContain('.specify/references/platform/eai-repo-contract.md');

    expect(specifyCommand).toContain('EAI App Delivery Preflight');
    expect(specifyCommand).toContain('EAI Platform/Azure App Stack Policy');
    expect(planCommand).toContain('EAI app-readiness handoff');
    expect(planCommand).toContain('EAI app lifecycle ordering handoff');
    expect(planCommand).toContain('next recovery command');
    expect(planCommand).toContain('EAI Platform/Azure app stack decision');
    expect(tasksCommand).toContain('EAI readiness unblock -> `eai-preflight.md`');
    expect(tasksCommand).toContain('App-template readiness cannot be deferred');
    expect(tasksCommand).toContain('App resource provisioning -> `eai app provision`');
    expect(tasksCommand).toContain('Object-type publish -> `eai types seed`');
    expect(tasksCommand).toMatch(
      /Do not copy the source\s+name\/slug schema into a direct PublicAPI request/
    );
    expect(tasksCommand).toContain(
      'Schema and storage health -> `eai resources schema` / storage diagnostics / `eai verify`'
    );
    expect(tasksCommand).toContain('Do not emit tasks that establish a non-EAI primary runtime');
    expect(implementCommand).toMatch(
      /resource provisioning,\s*object-type publish,\s*schema\/storage health,\s*and preview readiness as separate gates/i
    );
    expect(implementCommand).toMatch(/last\s+completed gate/i);
    expect(implementCommand).toContain('eai verify storage --tenant-id <tenant-id>');
    expect(implementCommand).toContain('EAI_ENTRA_REDIRECT_URI_MISMATCH');
    expect(implementCommand).toContain(
      'eai provision entra --force --redirect-uri <confirmed-callback-uri>'
    );
    expect(implementCommand).toMatch(
      /Record\s+only\s+a\s+redacted\s+callback\s+route\s+pattern\s+and\s+recovery\s+status/i
    );
    expect(implementCommand).toContain('.specify/references/platform/eai-error-catalog.yaml');
    expect(implementCommand).toContain('app_manifest_validation_failed');
    expect(implementCommand).toContain('PascalCase transport value');
    expect(implementCommand).toContain(
      'node .specify/scripts/node/eai-app-template-readiness.mjs --root .'
    );
    expect(implementCommand).toContain('blocks every app');
  });

  it('ships the EAI preflight template to canonical and mirrored resources', () => {
    const canonicalTemplate = readRepoFile('.specify/templates/eai-preflight-template.md');
    const mirroredTemplate = readRepoFile(
      'extension/resources/templates/eai-preflight-template.md'
    );

    expect(canonicalTemplate).toContain('App Stack Policy');
    expect(canonicalTemplate).toContain('Execution Order And Gate Tracking');
    expect(canonicalTemplate).toContain('CLI release status');
    expect(canonicalTemplate).toContain('Drift readiness');
    expect(canonicalTemplate).toContain('eai-app-template-readiness status');
    expect(canonicalTemplate).toContain('.eai-manifest.json');
    expect(canonicalTemplate).toContain('eai.runtime.json');
    expect(canonicalTemplate).toContain('Workflow readiness');
    expect(canonicalTemplate).toContain('Object-type publish');
    expect(canonicalTemplate).toContain('Entra redirect readiness');
    expect(canonicalTemplate).toContain('EAI_ENTRA_REDIRECT_URI_MISMATCH');
    expect(canonicalTemplate).toContain(
      'eai resources storage doctor --tenant-id <tenant-id> --format json'
    );
    expect(mirroredTemplate).toContain('App Stack Policy');
    expect(mirroredTemplate).toContain('Execution Order And Gate Tracking');
    expect(mirroredTemplate).toContain('CLI release status');
    expect(mirroredTemplate).toContain('Drift readiness');
    expect(mirroredTemplate).toContain('Workflow readiness');
    expect(mirroredTemplate).toContain('Object-type publish');
    expect(mirroredTemplate).toContain('Entra redirect readiness');
  });

  it('catalogs Entra redirect URI mismatch as an EAI-led recovery path', () => {
    const catalog = readRepoFile('.specify/references/platform/eai-error-catalog.yaml');

    expect(catalog).toContain('EAI_ENTRA_REDIRECT_URI_MISMATCH');
    expect(catalog).toContain('AADSTS50011');
    expect(catalog).toContain('/api/auth/callback/microsoft-entra-id');
    expect(catalog).toContain(
      'eai provision entra --force --redirect-uri <confirmed-callback-uri>'
    );
    expect(catalog).toContain('record only a redacted pattern');
    expect(catalog).toContain('Use --debug only with explicit user approval');
  });

  it('catalogs tenant member invite external-service failures as an EAI-led recovery path', () => {
    const catalog = readRepoFile('.specify/references/platform/eai-error-catalog.yaml');

    expect(catalog).toContain('EAI_USER_INVITE_EXTERNAL_SERVICE_EXISTING_MEMBER');
    expect(catalog).toContain('user_invite_external_service_existing_member');
    expect(catalog).toContain('EXTERNAL_SERVICE_ERROR');
    expect(catalog).toContain('eai user list --tenant <tenant-id> --search <email> --format json');
    expect(catalog).toContain(
      'eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json'
    );
    expect(catalog).toContain('Auth.js session or JWT role data may be cached');
    expect(catalog).toContain('Do not edit databases or cloud portals directly');
  });

  it('catalogs app-token missing tenant context as a tenant-scoped route recovery path', () => {
    const catalog = readRepoFile('.specify/references/platform/eai-error-catalog.yaml');

    expect(catalog).toContain('EAI_APP_TOKEN_TENANT_CONTEXT_REQUIRED');
    expect(catalog).toContain('app_token_tenant_context_required');
    expect(catalog).toContain('MISSING_TENANT');
    expect(catalog).toContain('Tenant context required for app tokens');
    expect(catalog).toContain('/v4/platform/tenants/<tenant-id>/users/by-email?email=<email>');
    expect(catalog).toContain('/v4/platform/tenants/<tenant-id>/users/<oid>/memberships');
    expect(catalog).toContain('/v4/platform/tenants/<tenant-id>/role-definitions');
    expect(catalog).toContain('Do not start by changing tenant members');
  });
});
