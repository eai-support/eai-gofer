import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('enterpriseai ui-first app-delivery guidance (root integration)', () => {
  it('keeps shared numbered stages while adding app-delivery-only preview and service-fit gates', () => {
    const scenarioCommand = readRepoFile('.claude/commands/0_gofer_start.md');
    const researchCommand = readRepoFile('.claude/commands/1_gofer_research.md');
    const planCommand = readRepoFile('.claude/commands/3_gofer_plan.md');
    const tasksCommand = readRepoFile('.claude/commands/4_gofer_tasks.md');
    const implementCommand = readRepoFile('.claude/commands/5_gofer_implement.md');
    const validateCommand = readRepoFile('.claude/commands/6_gofer_validate.md');

    expect(scenarioCommand).toContain('Shared Numbered Stage Contract');
    expect(scenarioCommand).toContain('UI-First App-Delivery Default');
    expect(scenarioCommand).toContain('EAI App Template');
    expect(scenarioCommand).toContain('service-fit gate');
    expect(scenarioCommand).toContain('gofer-ui-preview.mjs');
    expect(scenarioCommand).toContain('after every');
    expect(scenarioCommand).toContain('UI-facing change');
    expect(scenarioCommand).toContain('Non-app work');

    expect(researchCommand).toContain('ui-preview-brief.md');
    expect(researchCommand).toContain('EAI App Template constraint map');
    expect(researchCommand).toContain('Preview validation plan');
    expect(researchCommand).toContain('Fast preview runtime');
    expect(researchCommand).toContain('gofer-ui-preview.mjs');
    expect(researchCommand).toContain('external/internal/hybrid profile');
    expect(researchCommand).toContain('source-platform decoupling');
    expect(researchCommand).toContain('Storybook story IDs');
    expect(researchCommand).toContain('theme override points');

    expect(planCommand).toContain('ui-review-log.md');
    expect(planCommand).toContain('ui-approval.md');
    expect(planCommand).toContain('service-fit-matrix.md');
    expect(planCommand).toContain('preview command or URL');
    expect(planCommand).toContain('gofer-ui-preview.mjs');
    expect(planCommand).toContain('eai --describe');
    expect(planCommand).toContain('eai resources schema');
    expect(planCommand).toContain('eai verify calls --format');
    expect(planCommand).toContain('public-readiness');
    expect(planCommand).toContain('block-porting');
    expect(planCommand).toContain('package-profile');

    expect(tasksCommand).toContain('App-Delivery Preconditions Inside Shared Stages');
    expect(tasksCommand).toContain('ui-approval.md');
    expect(tasksCommand).toContain('service-fit-matrix.md');
    expect(tasksCommand).toContain('EAI App Template');
    expect(tasksCommand).toContain('package lane');
    expect(tasksCommand).toContain('coupling status');
    expect(tasksCommand).toContain('custom-block exceptions');
    expect(tasksCommand).toContain('record or confirm the preview command/URL');
    expect(tasksCommand).toContain('report the opened preview URL and screenshot path');
    expect(tasksCommand).toContain('external/internal/hybrid');
    expect(tasksCommand).toContain('eai resources schema --format json');

    expect(implementCommand).toContain('ui-approval.md');
    expect(implementCommand).toContain('ui-review-log.md');
    expect(implementCommand).toContain('service-fit-matrix.md');
    expect(implementCommand).toContain('For non-app work, skip the preview');
    expect(implementCommand).toContain('after every UI-facing change');
    expect(implementCommand).toContain('Report the opened URL and');
    expect(implementCommand).toContain('public-readiness');
    expect(implementCommand).toContain('eai resources schema --format json');
    expect(implementCommand).toContain('source-platform internals');

    expect(validateCommand).toContain('ui-review-log.md');
    expect(validateCommand).toContain('ui-approval.md');
    expect(validateCommand).toContain('service-fit-matrix.md');
    expect(validateCommand).toContain('equivalent opened-browser evidence');
    expect(validateCommand).toContain('latest preview-helper run');
    expect(validateCommand).toContain('For explicit non-app work');
    expect(validateCommand).toContain('Storybook story IDs');
    expect(validateCommand).toContain('theme override points');
  });

  it('ships app-delivery templates for preview, approval, and service-fit artifacts', () => {
    const canonicalTemplates = [
      '.specify/templates/ui-preview-brief-template.md',
      '.specify/templates/ui-review-log-template.md',
      '.specify/templates/ui-approval-template.md',
      '.specify/templates/service-fit-matrix-template.md',
      '.specify/templates/contract-pack-template.md',
      '.specify/templates/reuse-scan-template.md',
      '.specify/templates/context-bundle-template.md',
    ];
    const mirroredTemplates = canonicalTemplates.map((templatePath) =>
      templatePath.replace('.specify/templates', 'extension/resources/templates')
    );

    for (const templatePath of canonicalTemplates) {
      expect(fs.existsSync(path.join(process.cwd(), templatePath))).toBe(true);
    }

    for (const templatePath of mirroredTemplates) {
      expect(fs.existsSync(path.join(process.cwd(), templatePath))).toBe(true);
    }
  });

  it('ships the repo-owned fast preview helper into extension resources', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), '.specify/scripts/node/gofer-ui-preview.mjs'))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'extension/resources/node-scripts/gofer-ui-preview.mjs')
      )
    ).toBe(true);
  });
});
