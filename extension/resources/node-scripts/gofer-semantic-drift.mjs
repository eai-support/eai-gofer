#!/usr/bin/env node

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';
import { credentialStatus, resolveApiKey } from './gofer-typesafe-credentials.mjs';

const POLICY_RELATIVE_PATH = path.join('.specify', 'config', 'typesafe-semantic-review.json');
const MAX_ARTIFACT_BYTES = 64 * 1024;

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function confined(workspace, value) { return path.isAbsolute(value) ? value : path.resolve(workspace, value); }
function parseArgs(argv) {
  const args = { workspace: process.cwd(), featureDir: '', event: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workspace') { args.workspace = argv[++index] || args.workspace; }
    else if (arg === '--feature-dir') { args.featureDir = argv[++index] || ''; }
    else if (arg === '--event') { args.event = argv[++index] || ''; }
    else if (arg === '--json') { args.json = true; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.featureDir || !args.event) throw new Error('--feature-dir and --event are required');
  args.workspace = path.resolve(args.workspace); args.featureDir = confined(args.workspace, args.featureDir); return args;
}
async function readJson(target) { return JSON.parse(await fs.readFile(target, 'utf8')); }
async function readArtifact(target) { try { const value = await fs.readFile(target, 'utf8'); return value.slice(0, MAX_ARTIFACT_BYTES); } catch (error) { if (error?.code === 'ENOENT') return ''; throw error; } }
function normalizeAnswer(answer) { return String(answer || '').trim().toLowerCase(); }

export async function runSemanticReview({ workspace = process.cwd(), featureDir, event, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const policyPath = path.join(workspace, POLICY_RELATIVE_PATH);
  const policy = await readJson(policyPath);
  if (!policy.enabled || !policy.events.includes(event)) return { status: 'disabled', event };
  const credentials = await credentialStatus({ workspace, env });
  if (!credentials.configured) return { status: 'not_configured', event };
  const artifacts = await Promise.all(['goal-ledger.json', 'spec.md', 'plan.md', 'tasks.md', 'decisions.md', 'traceability.md'].map(async (name) => [name, await readArtifact(path.join(featureDir, name))]));
  const state = Object.fromEntries(artifacts.map(([name, content]) => [name, { sha256: digest(content), content }]));
  const { apiKey } = await resolveApiKey({ workspace, env });
  const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ model: 'jev-latest', state: JSON.stringify(state), questions: {
      goal_alignment: { type: 'choice', instructions: 'Does the current work remain aligned to the approved goal and specification?', criteria: { aligned: 'The work remains aligned.', partial: 'The work needs document reconciliation.', conflict: 'The work conflicts with approved direction.' } },
      required_action: { type: 'choice', instructions: 'What is the required delivery action?', criteria: { continue: 'Continue within the approved path.', reconcile: 'Reconcile affected artefacts before work continues.', ask_user: 'A material user decision is required.' } },
    } }),
  });
  if (!response.ok) return { status: 'unavailable', event, httpStatus: response.status };
  const payload = await response.json();
  const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const alignmentAnswer = answers.goal_alignment || {};
  const actionAnswer = answers.required_action || {};
  const alignment = normalizeAnswer(alignmentAnswer.choice);
  const action = normalizeAnswer(actionAnswer.choice);
  const confidences = [alignmentAnswer, actionAnswer].map((answer) => Number(answer.confidence ?? 0)).filter(Number.isFinite);
  const confidence = confidences.length > 0 ? Math.min(...confidences) : 0;
  const status = alignment === 'conflict' || action === 'ask_user' ? 'conflict' : confidence < policy.minimumConfidence || alignment === 'partial' || action === 'reconcile' ? 'reconcile' : 'aligned';
  const receipt = { schemaVersion: 1, provider: 'typesafe', event, status, confidence, policySha256: digest(JSON.stringify(policy)), artifacts: Object.fromEntries(artifacts.map(([name, content]) => [name, digest(content)])), answers: { goal_alignment: { choice: alignmentAnswer.choice || null, confidence: alignmentAnswer.confidence ?? null }, required_action: { choice: actionAnswer.choice || null, confidence: actionAnswer.confidence ?? null } } };
  const receiptPath = path.join(featureDir, 'evidence', 'semantic-review', `${event}.json`);
  await fs.mkdir(path.dirname(receiptPath), { recursive: true }); await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
async function main() { const args = parseArgs(process.argv.slice(2)); const result = await runSemanticReview(args); process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status === 'conflict') process.exitCode = 2; }
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
