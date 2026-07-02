import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('Gofer public execution-depth guidance', () => {
  it('documents generic risk labels across the six primary pipeline commands', () => {
    for (const file of [
      '1_gofer_research.md',
      '2_gofer_specify.md',
      '3_gofer_plan.md',
      '4_gofer_tasks.md',
      '5_gofer_implement.md',
      '6_gofer_validate.md',
    ]) {
      const content = fs.readFileSync(path.join(REPO_ROOT, '.specify/commands', file), 'utf8');
      const executionSection = content.slice(
        content.indexOf('## Execution'),
        content.indexOf('## Prerequisites') > -1
          ? content.indexOf('## Prerequisites')
          : content.indexOf('## Outline')
      );
      expect(executionSection).toContain('fast');
      expect(executionSection).toContain('standard');
      expect(executionSection).toContain('full');
      expect(executionSection).toContain('docs-only');
      expect(executionSection).toContain('artifact');
      expect(executionSection).not.toMatch(
        /\beai-stack\b|\bgas\b|\bQAgent\b|\bOPA\b|\bPayload\b|\beai-testing-dev\b/i
      );
    }
  });

  it('requires running PR/FAQ and persona review artifacts across the pipeline', () => {
    const scenario = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'),
      'utf8'
    );
    expect(scenario).toContain('working-backwards-prfaq.md');
    expect(scenario).toContain('prfaq-history/00-business-scenario.md');
    expect(scenario).toContain('stakeholder-review-index.md');

    const research = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/1_gofer_research.md'),
      'utf8'
    );
    expect(research).toContain('prfaq-history/01-research.md');
    expect(research).toContain('business-owner-summary.md');

    const specify = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/2_gofer_specify.md'),
      'utf8'
    );
    expect(specify).toContain('prfaq-history/02-specify.md');
    expect(specify).toContain('business-owner-summary.md');

    const plan = fs.readFileSync(path.join(REPO_ROOT, '.specify/commands/3_gofer_plan.md'), 'utf8');
    expect(plan).toContain('prfaq-history/03-plan.md');
    expect(plan).toContain('cto-architecture-summary.md');

    const tasks = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/4_gofer_tasks.md'),
      'utf8'
    );
    expect(tasks).toContain('prfaq-history/04-tasks.md');
    expect(tasks).toContain('stakeholder-review-index.md');

    const implement = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/5_gofer_implement.md'),
      'utf8'
    );
    expect(implement).toContain('prfaq-history/05-implement.md');
    expect(implement).toContain('loop-ledger.jsonl');

    const validate = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/6_gofer_validate.md'),
      'utf8'
    );
    expect(validate).toContain('prfaq-history/06-validate.md');
    expect(validate).toContain('ciso-security-summary.md');
    expect(validate).toContain('loop-audit-report.md');

    const comms = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/7a_stakeholder_comms.md'),
      'utf8'
    );
    expect(comms).toContain('working-backwards-prfaq.md');
    expect(comms).toContain('business-owner-summary.md');
    expect(comms).toContain('cto-architecture-summary.md');
    expect(comms).toContain('ciso-security-summary.md');
  });

  it('requires simple traceable visual communication in planning, comms, and validation', () => {
    const plan = fs.readFileSync(path.join(REPO_ROOT, '.specify/commands/3_gofer_plan.md'), 'utf8');
    expect(plan).toContain('Visual quality requirements for all planning visuals');
    expect(plan).toContain('about seven primary nodes or steps');
    expect(plan).toContain('EAI service/template asset');

    const validate = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/6_gofer_validate.md'),
      'utf8'
    );
    expect(validate).toContain('Visual And Document Comprehension Gate');
    expect(validate).toContain('human-facing artifacts lack a plain-language executive summary');
    expect(validate).toContain('stale visuals fail');
    expect(validate).toMatch(/Storybook\/component,\s+Playwright/);
    expect(validate).toContain('Marp decks must be valid Markdown');

    const comms = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/7a_stakeholder_comms.md'),
      'utf8'
    );
    expect(comms).toMatch(/visual\s+explanation quality gate/);
    expect(comms).toContain('revise visuals <artifact>');
    expect(comms).toContain('presentation.marp.md');
    expect(comms).toContain('Every human-facing document starts');

    const stakeholderIndex = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/templates/stakeholder-review-index-template.md'),
      'utf8'
    );
    expect(stakeholderIndex).toContain('stakeholder-pack.md');
    expect(stakeholderIndex).toContain('revise visuals <artifact>');
    expect(stakeholderIndex).toContain('presentation.marp.md');

    for (const template of [
      '.specify/templates/research-template.md',
      '.specify/templates/spec-template.md',
      '.specify/templates/plan-template.md',
      '.specify/templates/stakeholder-comms-template.md',
      '.specify/templates/business-owner-summary-template.md',
      '.specify/templates/cto-architecture-summary-template.md',
      '.specify/templates/ciso-security-summary-template.md',
    ]) {
      const content = fs.readFileSync(path.join(REPO_ROOT, template), 'utf8');
      expect(content).toContain('Executive Summary');
    }
  });
});
