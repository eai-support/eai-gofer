import { describe, expect, it } from 'vitest';
import { inspectReleaseWorkflowRun } from '../../../scripts/inspect-release-workflow-run.mjs';

function makeRun({
  conclusion = 'success',
  releaseConclusion = 'success',
  marketplaceConclusion = 'success',
  supportingConclusion = 'success',
} = {}) {
  return {
    status: 'completed',
    conclusion,
    jobs: [
      {
        name: 'desktop-contracts / Native protocol (ubuntu-latest)',
        conclusion: supportingConclusion,
      },
      {
        name: 'Build and Publish Release',
        conclusion: releaseConclusion,
        steps: [
          { name: 'Run Gofer Unit Tests', conclusion: 'success' },
          { name: 'Test packaged MCP and LSP runtime', conclusion: 'success' },
          { name: 'Publish GitHub Release', conclusion: 'success' },
          {
            name: 'Publish VS Code Marketplace Extension',
            conclusion: marketplaceConclusion,
          },
          { name: 'Summarize VS Code Marketplace Status', conclusion: 'success' },
        ],
      },
    ],
  };
}

describe('inspect-release-workflow-run', () => {
  it('accepts a successful workflow after all checks and official publication pass', () => {
    expect(inspectReleaseWorkflowRun(makeRun())).toMatchObject({
      ready: true,
      marketplaceFailures: [],
    });
  });

  it('allows feed promotion when only the Marketplace step fails, while reporting it', () => {
    const result = inspectReleaseWorkflowRun(
      makeRun({
        conclusion: 'failure',
        releaseConclusion: 'failure',
        marketplaceConclusion: 'failure',
      })
    );

    expect(result).toMatchObject({ ready: true });
    expect(result.reason).toContain('Marketplace remains failed');
    expect(result.marketplaceFailures).toContain('Publish VS Code Marketplace Extension');
  });

  it('blocks feed promotion when a required supporting job fails', () => {
    expect(inspectReleaseWorkflowRun(makeRun({ supportingConclusion: 'failure' }))).toMatchObject({
      ready: false,
      reason: expect.stringContaining('desktop-contracts'),
    });
  });

  it('blocks a failed release job when no Marketplace-only failure explains it', () => {
    expect(inspectReleaseWorkflowRun(makeRun({ releaseConclusion: 'failure' }))).toMatchObject({
      ready: false,
      reason: expect.stringContaining('outside the Marketplace steps'),
    });
  });

  it('blocks feed promotion when a core check fails before GitHub publication', () => {
    const run = makeRun();
    run.jobs[1].steps[0].conclusion = 'failure';

    expect(inspectReleaseWorkflowRun(run)).toMatchObject({
      ready: false,
      reason: expect.stringContaining('Run Gofer Unit Tests'),
    });
  });

  it('blocks feed promotion when the official GitHub Release upload fails', () => {
    const run = makeRun();
    run.jobs[1].steps[2].conclusion = 'failure';

    expect(inspectReleaseWorkflowRun(run)).toMatchObject({
      ready: false,
      reason: expect.stringContaining('official GitHub Release'),
    });
  });

  it('blocks unrelated post-publication failures', () => {
    const run = makeRun({ conclusion: 'failure', releaseConclusion: 'failure' });
    run.jobs[1].steps.push({ name: 'Unexpected deployment', conclusion: 'failure' });

    expect(inspectReleaseWorkflowRun(run)).toMatchObject({
      ready: false,
      reason: expect.stringContaining('Unexpected deployment'),
    });
  });

  it('blocks a Marketplace failure when the workflow did not record its summary', () => {
    const run = makeRun({
      conclusion: 'failure',
      releaseConclusion: 'failure',
      marketplaceConclusion: 'failure',
    });
    run.jobs[1].steps[4].conclusion = 'failure';

    expect(inspectReleaseWorkflowRun(run)).toMatchObject({
      ready: false,
      reason: expect.stringContaining('Summarize VS Code Marketplace Status'),
    });
  });
});
