import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkPreEdit } from '../../../.specify/scripts/node/gofer-pre-edit-check.mjs';

describe('Gofer pre-edit readiness check', () => {
  let workspace = '';
  let featureDir = '';

  async function write(relative: string, content: string) {
    const target = path.join(featureDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }

  async function createValidFeature() {
    await write(
      'goal-ledger.json',
      JSON.stringify({ goals: [{ goal: 'Deliver the agreed feature.' }] })
    );
    await write(
      'spec.md',
      '# Feature specification\n\n## Requirements\n\n- **FR-001**: Gate code edits on current feature scope.\n'
    );
    await write(
      'plan.md',
      '# Implementation plan\n\nImplement the approved gate and verify it with focused tests.\n'
    );
    await write('tasks.md', '- [ ] T001 Add the deterministic pre-edit readiness gate.\n');
    await write(
      'decisions.md',
      '- **D001**: Run a deterministic local pre-edit gate for each implementation batch.\n'
    );
    await write('traceability.md', 'T001 -> FR-001\n');
    await write(
      'priority-plan.json',
      JSON.stringify({
        schemaVersion: 2,
        revision: 'D001',
        objective: 'Deliver a safe pre-edit gate.',
        lastInstruction: {
          id: 'D001',
          text: 'Run a deterministic local pre-edit gate for each implementation batch.',
        },
        decisionPolicy: { mode: 'goal-led', askOnlyFor: ['goal-change'] },
        criticalPath: ['T001'],
        tasks: {
          T001: {
            dependsOn: [],
            allowedEditScope: ['.specify/scripts/node/', 'tests/unit/scripts/'],
          },
        },
        outcome: {
          id: 'OUTCOME-1',
          statement: 'The gate blocks unsafe work.',
          requirements: ['FR-001'],
          target: { environment: 'local', revision: 'source-under-test' },
          receipt: 'evidence/outcome.json',
        },
      })
    );
  }

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-pre-edit-'));
    featureDir = path.join(workspace, '.specify', 'specs', 'test-feature');
    await fs.mkdir(featureDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('blocks when any required feature document is missing', async () => {
    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['.specify/scripts/node/new-helper.mjs'],
    });

    expect(result).toMatchObject({ status: 'blocked' });
    expect(result.findings).toContain('MISSING_FILE:spec.md');
    expect(result.findings).toContain('MISSING_FILE:plan.md');
    expect(result.findings).toContain('MISSING_FILE:tasks.md');
  });

  it('blocks a template-filled specification', async () => {
    await createValidFeature();
    await write(
      'spec.md',
      '# Feature Specification: [FEATURE NAME]\n\n- **FR-001**: [specific capability]\n'
    );

    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['.specify/scripts/node/new-helper.mjs'],
    });

    expect(result).toMatchObject({ status: 'blocked', findings: ['TEMPLATE_FILE:spec.md'] });
  });

  it('passes an authorized task without calling Jev by default', async () => {
    await createValidFeature();

    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['.specify/scripts/node/new-helper.mjs'],
    });

    expect(result).toMatchObject({ status: 'ready', task: 'T001', jev: { selected: false } });
  });

  it('blocks a changed file outside the approved task scope', async () => {
    await createValidFeature();

    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['src/unrelated.ts'],
    });

    expect(result.status).toBe('blocked');
    expect(result.findings).toContain('EDIT_OUTSIDE_SCOPE:src/unrelated.ts');
  });

  it('blocks an incomplete or unknown task', async () => {
    await createValidFeature();
    await write('tasks.md', '- [x] T001 Add the deterministic pre-edit readiness gate.\n');

    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['.specify/scripts/node/new-helper.mjs'],
    });

    expect(result.status).toBe('blocked');
    expect(result.findings[0]).toMatch(/^PRIORITY_CHECK_INVALID:/);
  });

  it('rejects a Jev context path outside the feature folder', async () => {
    await createValidFeature();

    const result = await checkPreEdit({
      workspace,
      featureDir: '.specify/specs/test-feature',
      task: 'T001',
      changedFiles: ['.specify/scripts/node/new-helper.mjs'],
      jevChatReadiness: true,
      chatContextFile: '../private-chat.md',
    });

    expect(result).toMatchObject({ status: 'blocked', findings: ['CHAT_CONTEXT_PATH_INVALID'] });
  });

  it('sends the selected readiness context and blocks unless Jev says ready', async () => {
    await createValidFeature();
    await write(
      'chat-readiness-context.md',
      'The user wants a local pre-edit gate. No deployment is requested.'
    );
    const review = vi.fn(async (input: Record<string, unknown>) => {
      expect(input).toMatchObject({
        workspace: await fs.realpath(workspace),
        featureDir: await fs.realpath(featureDir),
        event: 'chat_readiness',
        chatContext: 'The user wants a local pre-edit gate. No deployment is requested.',
        onDemand: true,
      });
      return { status: 'reconcile', confidence: 0.42 };
    });

    const result = await checkPreEdit(
      {
        workspace,
        featureDir: '.specify/specs/test-feature',
        task: 'T001',
        changedFiles: ['.specify/scripts/node/new-helper.mjs'],
        jevChatReadiness: true,
        chatContextFile: 'chat-readiness-context.md',
      },
      { semanticReview: review }
    );

    expect(review).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'blocked',
      findings: ['JEV_CHAT_READINESS_RECONCILE'],
      jev: { selected: true, status: 'reconcile', confidence: 0.42 },
    });
  });

  it('blocks safely when the selected Jev review throws unexpectedly', async () => {
    await createValidFeature();
    await write('chat-readiness-context.md', 'The request and intended outcome are clear.');

    const result = await checkPreEdit(
      {
        workspace,
        featureDir: '.specify/specs/test-feature',
        task: 'T001',
        changedFiles: ['.specify/scripts/node/new-helper.mjs'],
        jevChatReadiness: true,
        chatContextFile: 'chat-readiness-context.md',
      },
      {
        semanticReview: vi.fn(async () => {
          throw new Error('unexpected provider failure');
        }),
      }
    );

    expect(result).toMatchObject({
      status: 'blocked',
      findings: ['JEV_CHAT_READINESS_UNAVAILABLE'],
      jev: { selected: true, status: 'unavailable' },
    });
  });

  it('fails closed with a clear size finding when chat context exceeds its limit', async () => {
    await createValidFeature();
    await write('chat-readiness-context.md', 'x'.repeat(16 * 1024 + 1));
    const review = vi.fn();

    const result = await checkPreEdit(
      {
        workspace,
        featureDir: '.specify/specs/test-feature',
        task: 'T001',
        changedFiles: ['.specify/scripts/node/new-helper.mjs'],
        jevChatReadiness: true,
        chatContextFile: 'chat-readiness-context.md',
      },
      { semanticReview: review }
    );

    expect(result).toMatchObject({
      status: 'blocked',
      findings: ['CHAT_CONTEXT_TOO_LARGE'],
      chatContext: { actualBytes: 16 * 1024 + 1, maximumBytes: 16 * 1024 },
    });
    expect(review).not.toHaveBeenCalled();
  });
});
