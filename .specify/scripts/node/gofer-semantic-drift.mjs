#!/usr/bin/env node

import { createHash } from 'crypto';
import { constants } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';
import { credentialStatus, resolveApiKey } from './gofer-typesafe-credentials.mjs';

const POLICY_RELATIVE_PATH = path.join('.specify', 'config', 'typesafe-semantic-review.json');
const MAX_ARTIFACT_BYTES = 64 * 1024;
// A local artifact far larger than any real spec/plan/tasks file is treated
// as a hard error rather than hashed in full: this bounds worst-case memory
// use independent of the provider payload cap.
const MAX_ARTIFACT_READ_BYTES = 8 * 1024 * 1024;

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
// A byte-count slice can land mid-sequence; decoding that with toString('utf8')
// replaces the fragment with U+FFFD (3 bytes), which can grow back past the
// bound it was meant to enforce. Back up to the sequence boundary instead.
function truncateUtf8(buffer, maxBytes) {
  // Note: still checked when buffer.length === maxBytes exactly, since that
  // is precisely the case a capped collector produces when the source has
  // more data — the boundary byte may be mid-sequence.
  if (buffer.length < maxBytes) return buffer;
  let cut = maxBytes;
  let i = maxBytes - 1;
  while (i > 0 && (buffer[i] & 0xc0) === 0x80) i--;
  const lead = buffer[i];
  let seqLen = 1;
  if ((lead & 0xe0) === 0xc0) seqLen = 2;
  else if ((lead & 0xf0) === 0xe0) seqLen = 3;
  else if ((lead & 0xf8) === 0xf0) seqLen = 4;
  if (i + seqLen > maxBytes) cut = i;
  return buffer.subarray(0, cut);
}
// A lexical check alone does not stop a symlinked intermediate directory (or
// the feature directory itself) from redirecting reads/writes outside the
// workspace. Walk every component from the workspace root and reject any
// that is a symlink, matching this repository's other protected readers.
async function assertNoSymlinkComponents(root, relativeTarget) {
  const components = relativeTarget.split(path.sep).filter(Boolean);
  let currentPath = root;
  for (const component of components) {
    currentPath = path.join(currentPath, component);
    try {
      const status = await fs.lstat(currentPath);
      if (status.isSymbolicLink()) throw new Error('Gofer feature directory must not pass through a symbolic link.');
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}
// Reject any feature directory outside the workspace instead of trusting the
// caller: an escaping path would read arbitrary files, send their contents to
// the external provider, and write the receipt outside the workspace.
async function confined(workspace, value) {
  const target = path.resolve(workspace, value);
  const relative = path.relative(workspace, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Gofer feature directory must remain inside the workspace.');
  }
  await assertNoSymlinkComponents(workspace, relative);
  // A typo'd or nonexistent feature directory must fail closed here, not
  // silently produce an all-empty state that could earn a false "aligned"
  // verdict and then have the directory created out from under it by mkdir
  // when the receipt is written.
  const info = await fs.lstat(target).catch(() => null);
  if (!info || !info.isDirectory()) throw new Error('Gofer feature directory does not exist.');
  return target;
}
async function parseArgs(argv) {
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
  args.workspace = path.resolve(args.workspace); args.featureDir = await confined(args.workspace, args.featureDir); return args;
}
async function readJson(target) { return JSON.parse(await fs.readFile(target, 'utf8')); }
// The hash must bind the full file, not the truncated slice sent to the
// provider: hashing only the truncated content would leave drift past
// MAX_ARTIFACT_BYTES invisible to the receipt. Hash incrementally rather than
// materializing the whole file as one string, so a large local artifact
// cannot exhaust memory even though only a bounded prefix is ever sent.
// MAX_ARTIFACT_BYTES bounds the actual UTF-8 payload sent, not the JS
// string's UTF-16 code-unit length, so a non-ASCII file cannot exceed the
// advertised provider payload bound. Opened with O_NOFOLLOW so a same-account
// symlink swap between validation and read cannot redirect the artifact to a
// file outside the workspace. A missing artifact is reported as absent, not
// silently treated as an empty file — the caller must fail closed on that,
// not risk a false "aligned" verdict built from missing documents.
async function readArtifact(target) {
  let handle;
  try { handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) {
    if (error?.code === 'ENOENT') return { present: false, sha256: digest(''), sent: '' };
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Gofer feature artifact must be a regular file.');
    if (info.size > MAX_ARTIFACT_READ_BYTES) throw new Error('Gofer feature artifact exceeds the maximum readable size.');
    const hash = createHash('sha256');
    const sentChunks = [];
    let sentBytes = 0;
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
      if (sentBytes < MAX_ARTIFACT_BYTES) {
        const remaining = MAX_ARTIFACT_BYTES - sentBytes;
        const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        sentChunks.push(piece);
        sentBytes += piece.length;
      }
    }
    const sent = truncateUtf8(Buffer.concat(sentChunks), MAX_ARTIFACT_BYTES).toString('utf8');
    return { present: true, sha256: hash.digest('hex'), sent };
  } finally { await handle.close(); }
}
function normalizeAnswer(answer) { return String(answer || '').trim().toLowerCase(); }
// A response outside this set is unexpected (a provider bug, a new API
// version, a malformed payload) and must not be read as a silent pass.
const KNOWN_ALIGNMENTS = new Set(['aligned', 'partial', 'conflict']);
const KNOWN_ACTIONS = new Set(['continue', 'reconcile', 'ask_user']);

export async function runSemanticReview({ workspace = process.cwd(), featureDir, event, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const resolvedWorkspace = path.resolve(workspace);
  featureDir = await confined(resolvedWorkspace, featureDir);
  const policyPath = path.join(resolvedWorkspace, POLICY_RELATIVE_PATH);
  const policy = await readJson(policyPath);
  if (!policy.enabled || !policy.events.includes(event)) return { status: 'disabled', event };
  const credentials = await credentialStatus({ workspace, env });
  if (!credentials.configured) return { status: 'not_configured', event };
  const artifacts = await Promise.all(['goal-ledger.json', 'spec.md', 'plan.md', 'tasks.md', 'decisions.md', 'traceability.md'].map(async (name) => [name, await readArtifact(path.join(featureDir, name))]));
  // A missing artifact is not the same as an empty one: recorded so the
  // receipt is auditable, even though an early-stage feature legitimately
  // has not written every document yet (the feature directory itself
  // already had to exist, per confined() above).
  const missingArtifacts = artifacts.filter(([, info]) => !info.present).map(([name]) => name);
  const state = Object.fromEntries(artifacts.map(([name, { present, sha256, sent }]) => [name, { present, sha256, content: sent }]));
  const { apiKey } = await resolveApiKey({ workspace, env });
  let response;
  try {
    response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ model: 'jev-latest', state: JSON.stringify(state), questions: {
        goal_alignment: { type: 'choice', instructions: 'Does the current work remain aligned to the approved goal and specification?', criteria: { aligned: 'The work remains aligned.', partial: 'The work needs document reconciliation.', conflict: 'The work conflicts with approved direction.' } },
        required_action: { type: 'choice', instructions: 'What is the required delivery action?', criteria: { continue: 'Continue within the approved path.', reconcile: 'Reconcile affected artefacts before work continues.', ask_user: 'A material user decision is required.' } },
      } }),
    });
  } catch (error) {
    // A network failure or timeout is not a verdict. Report it as
    // unavailable rather than letting the caller's caller see an uncaught
    // exception where it expects a status.
    return { status: 'unavailable', event, reason: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error' };
  }
  if (!response.ok) return { status: 'unavailable', event, httpStatus: response.status };
  let payload;
  try { payload = await response.json(); } catch { return { status: 'unavailable', event, reason: 'invalid_response_body' }; }
  const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const alignmentAnswer = answers.goal_alignment || {};
  const actionAnswer = answers.required_action || {};
  const alignment = normalizeAnswer(alignmentAnswer.choice);
  const action = normalizeAnswer(actionAnswer.choice);
  // An invalid or out-of-range confidence must count as zero, not be
  // dropped: dropping it would let one bad value be outweighed by the
  // other, and an out-of-range value (e.g. 2) would otherwise satisfy the
  // minimum-confidence check on a malformed response.
  const confidences = [alignmentAnswer, actionAnswer].map((answer) => {
    const value = Number(answer.confidence);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
  });
  const confidence = Math.min(...confidences);
  // An answer outside the known choice set fails toward reconcile, not
  // toward a silent aligned pass: an unexpected label must not be read as
  // "everything is fine".
  const recognized = KNOWN_ALIGNMENTS.has(alignment) && KNOWN_ACTIONS.has(action);
  const status = alignment === 'conflict' || action === 'ask_user' ? 'conflict'
    : !recognized || confidence < policy.minimumConfidence || alignment === 'partial' || action === 'reconcile' ? 'reconcile'
    : 'aligned';
  const receipt = { schemaVersion: 1, provider: 'typesafe', event, status, confidence, missingArtifacts, policySha256: digest(JSON.stringify(policy)), artifacts: Object.fromEntries(artifacts.map(([name, { sha256 }]) => [name, sha256])), answers: { goal_alignment: { choice: alignmentAnswer.choice || null, confidence: alignmentAnswer.confidence ?? null }, required_action: { choice: actionAnswer.choice || null, confidence: actionAnswer.confidence ?? null } } };
  const receiptDir = path.join(featureDir, 'evidence', 'semantic-review');
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${event}.json`);
  // O_NOFOLLOW plus O_TRUNC on an existing regular file: this refuses to
  // write through a symlink while still allowing a normal re-run to replace
  // this event's own prior receipt.
  const receiptHandle = await fs.open(receiptPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { await receiptHandle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`); } finally { await receiptHandle.close(); }
  return receipt;
}
// A CI/automation caller must not read "exit 0" as a pass for anything other
// than a genuine alignment or an intentionally inactive review: reconcile,
// unavailable, and not_configured all mean the checkpoint was not verified.
export function exitCodeForStatus(status) {
  if (status === 'conflict') return 2;
  if (!['disabled', 'aligned'].includes(status)) return 3;
  return 0;
}
async function main() {
  const args = await parseArgs(process.argv.slice(2));
  const result = await runSemanticReview(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCodeForStatus(result.status);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
