import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('enterpriseai eai app delivery preflight (root integration)', () => {
  it('gates EAI app delivery before journey mapping and implementation planning', () => {
    const scenarioCommand = readRepoFile('.claude/commands/0_gofer_start.md');
    const researchCommand = readRepoFile('.claude/commands/1_gofer_research.md');
    const specifyCommand = readRepoFile('.claude/commands/2_gofer_specify.md');
    const planCommand = readRepoFile('.claude/commands/3_gofer_plan.md');
    const tasksCommand = readRepoFile('.claude/commands/4_gofer_tasks.md');
    const implementCommand = readRepoFile('.claude/commands/5_gofer_implement.md');

    expect(scenarioCommand).toContain('EAI App Delivery Preflight');
    expect(scenarioCommand).toContain('EAI Platform And Azure App Stack Policy');
    expect(scenarioCommand).toContain('EAI Platform first, including the EAI app template');
    expect(scenarioCommand).toMatch(
      /App delivery in EAI Gofer means EAI Platform\s+delivery by default/
    );
    expect(scenarioCommand).toContain('/gofer:eai-first-run');
    expect(scenarioCommand).toContain('npm install -g @eai-tools/cli');
    expect(scenarioCommand).toContain('eai update --check');
    expect(scenarioCommand).toContain('eai login');
    expect(scenarioCommand).toContain('eai tenant list --format json');
    expect(scenarioCommand).toContain('eai init <app-name>');
    expect(scenarioCommand).toContain('eai template check --format json');
    expect(scenarioCommand).toMatch(/eai gofer\s+refresh --check\s+--format json/);
    expect(scenarioCommand).toContain('eai workflow readiness --format json');
    expect(scenarioCommand).toContain('eai app create <name>');
    expect(scenarioCommand).toContain(
      'eai app provision <key> --tenant-id <tenant-id> --select --format json'
    );
    expect(scenarioCommand).toContain('AADSTS50011');
    expect(scenarioCommand).toContain('EAI_ENTRA_REDIRECT_URI_MISMATCH');
    expect(scenarioCommand).toMatch(
      /eai provision entra --force\s+--redirect-uri <exact-callback-uri> --debug/
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
    expect(tasksCommand).toContain('App resource provisioning -> `eai app provision`');
    expect(tasksCommand).toContain('Object-type publish -> `eai types seed`');
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
      'eai provision entra --force --redirect-uri <exact-callback-uri> --debug'
    );
    expect(implementCommand).toContain('.specify/references/platform/eai-error-catalog.yaml');
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
      'eai provision entra --force --redirect-uri <exact-callback-uri> --debug'
    );
  });
});
