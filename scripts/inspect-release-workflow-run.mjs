#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASE_JOB_NAME = 'Build and Publish Release';
const RELEASE_STEP_NAME = 'Publish GitHub Release';
const MARKETPLACE_SUMMARY_STEP_NAME = 'Summarize VS Code Marketplace Status';
const MARKETPLACE_FAILURE_STEPS = new Set([
  'Azure Login for VS Code Marketplace Publish',
  'Resolve VS Marketplace Identity',
  'Publish VS Code Marketplace Extension',
]);
const FAILED_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required']);

export function inspectReleaseWorkflowRun(run) {
  if (!run || typeof run !== 'object') {
    return { ready: false, reason: 'Release workflow result is missing.' };
  }

  if (run.status && run.status !== 'completed') {
    return { ready: false, reason: `Release workflow is not complete (${run.status}).` };
  }

  if (!['success', 'failure'].includes(run.conclusion)) {
    return {
      ready: false,
      reason: `Release workflow did not complete successfully (${run.conclusion || 'unknown'}).`,
    };
  }

  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  const releaseJob = jobs.find((job) => job.name === RELEASE_JOB_NAME);
  if (!releaseJob) {
    return { ready: false, reason: `Required release job '${RELEASE_JOB_NAME}' is missing.` };
  }

  const failedSupportingJob = jobs.find(
    (job) => job !== releaseJob && job.conclusion !== 'success'
  );
  if (failedSupportingJob) {
    return {
      ready: false,
      reason: `Required job '${failedSupportingJob.name}' did not succeed (${failedSupportingJob.conclusion || 'unknown'}).`,
    };
  }

  const steps = Array.isArray(releaseJob.steps) ? releaseJob.steps : [];
  const releaseStepIndex = steps.findIndex((step) => step.name === RELEASE_STEP_NAME);
  if (releaseStepIndex < 0 || steps[releaseStepIndex].conclusion !== 'success') {
    return { ready: false, reason: 'The official GitHub Release was not published successfully.' };
  }

  const failedPreReleaseStep = steps
    .slice(0, releaseStepIndex)
    .find((step) => step.conclusion !== 'success');
  if (failedPreReleaseStep) {
    return {
      ready: false,
      reason: `Core release check '${failedPreReleaseStep.name}' did not succeed (${failedPreReleaseStep.conclusion || 'unknown'}).`,
    };
  }

  const failedSteps = steps.filter((step) => FAILED_CONCLUSIONS.has(step.conclusion));
  const unrelatedFailure = failedSteps.find((step) => !MARKETPLACE_FAILURE_STEPS.has(step.name));
  if (unrelatedFailure) {
    return {
      ready: false,
      reason: `Release step '${unrelatedFailure.name}' failed after GitHub publication.`,
    };
  }

  const marketplaceSummary = steps.find((step) => step.name === MARKETPLACE_SUMMARY_STEP_NAME);
  if (marketplaceSummary?.conclusion !== 'success') {
    return {
      ready: false,
      reason: 'Marketplace status summary was not recorded successfully.',
    };
  }

  const marketplaceFailures = failedSteps.map((step) => step.name);
  if (!['success', 'failure'].includes(releaseJob.conclusion)) {
    return {
      ready: false,
      reason: `Required release job did not complete (${releaseJob.conclusion || 'unknown'}).`,
    };
  }

  if (releaseJob.conclusion === 'failure' && marketplaceFailures.length === 0) {
    return {
      ready: false,
      reason: 'The release job failed for a reason outside the Marketplace steps.',
    };
  }

  if (run.conclusion === 'failure' && marketplaceFailures.length === 0) {
    return {
      ready: false,
      reason: 'The release workflow failed for a reason outside the Marketplace steps.',
    };
  }

  return {
    ready: true,
    marketplaceFailures,
    reason: marketplaceFailures.length
      ? `The official GitHub Release and core checks passed; Marketplace remains failed: ${marketplaceFailures.join(', ')}.`
      : 'The official GitHub Release and all required workflow checks passed.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let result;
  try {
    result = inspectReleaseWorkflowRun(JSON.parse(input));
  } catch (error) {
    console.error(`release-workflow: invalid result JSON: ${error.message}`);
    process.exit(1);
  }

  if (!result.ready) {
    console.error(`release-workflow: ${result.reason}`);
    process.exit(1);
  }

  console.log(`release-workflow: ${result.reason}`);
}
