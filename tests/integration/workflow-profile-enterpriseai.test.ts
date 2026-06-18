import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Workflow profile enterpriseai activation', () => {
  it('includes enterpriseai in workflow profile enum', () => {
    const packagePath = path.join(process.cwd(), 'extension', 'package.json');
    const extensionPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
      contributes: { configuration: { properties: Record<string, { enum?: string[] }> } };
    };

    const workflowProfile =
      extensionPackage.contributes.configuration.properties['gofer.workflowProfile'];
    expect(workflowProfile?.enum).toContain('enterpriseai');
  });

  it('provides local EnterpriseAI fallback references', () => {
    const referenceDir = path.join(process.cwd(), '.specify', 'references', 'platform');
    const requiredFiles = [
      'README.md',
      'eai.md',
      'eai-app-template.md',
      'vertical-template.md',
      'deployment-repo.md',
    ];

    requiredFiles.forEach((fileName) => {
      const fullPath = path.join(referenceDir, fileName);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  it('adds EAI CLI version pin placeholders to plan/tasks templates', () => {
    const planTemplate = fs.readFileSync(
      path.join(process.cwd(), '.specify', 'templates', 'plan-template.md'),
      'utf8'
    );
    const tasksTemplate = fs.readFileSync(
      path.join(process.cwd(), '.specify', 'templates', 'tasks-template.md'),
      'utf8'
    );

    expect(planTemplate).toContain('**EAI CLI Version Pin**');
    expect(tasksTemplate).toContain('**EAI CLI Version Pin**');
  });
});
