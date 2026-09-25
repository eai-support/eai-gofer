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
const DELIVERY_ARTIFACTS = [
  'goal-ledger.json',
  'spec.md',
  'plan.md',
  'tasks.md',
  'decisions.md',
  'traceability.md',
  'test-spec.md',
  'change-manifest.json',
  'blast-radius-report.md',
];
const COMPLETE_EVIDENCE_EVENTS = new Set([
  'before_task_batch',
  'after_material_finding',
  'before_validation',
]);

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
// O_NOFOLLOW is unavailable on Windows; the bitwise OR silently contributes
// nothing there rather than erroring, which would otherwise look like
// protection that isn't actually applied. lstat detects a symlink or
// junction cross-platform (including Windows) and is the actual protection;
// O_NOFOLLOW only closes the small remaining gap between that check and the
// open, on platforms that support it.
const noFollowFlag = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
async function assertNotSymlink(target) {
  const info = await fs.lstat(target).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error('Gofer path must not be a symbolic link.');
  return info;
}
async function openExistingNoFollow(target, flags) {
  await assertNotSymlink(target);
  return fs.open(target, flags | noFollowFlag);
}
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
// assertNoSymlinkComponents only walks descendants of root; it never checks
// root itself. A caller-supplied workspace that is a symlink (or missing, or
// not a directory) would otherwise sail through every confinement check
// below it. Matches workspace-bootstrap-lib.mjs's assertSafeWorkspaceRoot.
async function assertSafeWorkspaceRoot(workspaceRoot) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const rootStat = await fs.lstat(resolvedRoot).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!rootStat) throw new Error('Gofer workspace root does not exist.');
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('Gofer workspace root must be a real directory, not a symbolic link.');
  }
  return resolvedRoot;
}
// The event name is used verbatim to build the receipt file path. It is
// checked against policy.events, but that list is itself external config
// (or attacker-influenced if the config is compromised) and is never
// restricted to a safe charset, so a value like "../../evil" would satisfy
// the membership check while still escaping receiptDir on join. Restrict to
// a safe charset before it ever reaches a path.
function assertSafeEventName(event) {
  if (!/^[A-Za-z0-9_-]+$/.test(event)) {
    throw new Error('Gofer TypeSafe event name contains unsupported characters.');
  }
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
  assertSafeEventName(args.event);
  args.workspace = await assertSafeWorkspaceRoot(args.workspace); args.featureDir = await confined(args.workspace, args.featureDir); return args;
}
// The policy path is fixed, but a symlinked .specify/config directory or the
// policy file itself could still redirect this read outside the workspace,
// bypassing the same confinement invariant enforced for the feature
// directory and its artifacts. Apply the same no-follow protection.
async function readConfinedJson(workspace, relativePath) {
  await assertNoSymlinkComponents(workspace, relativePath);
  const target = path.join(workspace, relativePath);
  const handle = await openExistingNoFollow(target, constants.O_RDONLY);
  try { return JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
}
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
  try { handle = await openExistingNoFollow(target, constants.O_RDONLY); }
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
    // autoClose defaults to true, which would close the handle at EOF and
    // make the finally block's own close() below fail on an already-closed
    // handle. The finally block owns the close; the stream must not race it.
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
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

export async function runSemanticReview({ workspace = process.cwd(), featureDir, event, fetchImpl = globalThis.fetch, env = process.env, keychain } = {}) {
  assertSafeEventName(event);
  const resolvedWorkspace = await assertSafeWorkspaceRoot(workspace);
  featureDir = await confined(resolvedWorkspace, featureDir);
  const policy = await readConfinedJson(resolvedWorkspace, POLICY_RELATIVE_PATH);
  const credentials = await credentialStatus({ workspace, env, keychain });
  const globallyConnected = credentials.source === 'macos_keychain';
  if (!policy.enabled && !globallyConnected) return { status: 'disabled', event };
  // A syntactically valid but malformed enabled policy must not silently
  // bypass its own gate: `confidence < undefined` is always false in JS, so
  // a missing/non-numeric minimumConfidence would otherwise let any
  // confidence "pass" the threshold check regardless of its actual value.
  if (!Array.isArray(policy.events) || !policy.events.every((value) => typeof value === 'string') ||
      typeof policy.minimumConfidence !== 'number' || !Number.isFinite(policy.minimumConfidence) ||
      policy.minimumConfidence < 0 || policy.minimumConfidence > 1) {
    throw new Error('Gofer TypeSafe policy is enabled but malformed (events or minimumConfidence).');
  }
  if (!policy.events.includes(event)) return { status: 'disabled', event };
  if (!credentials.configured) return { status: 'not_configured', event };
  const artifacts = await Promise.all(DELIVERY_ARTIFACTS.map(async (name) => [name, await readArtifact(path.join(featureDir, name))]));
  // A missing artifact is not the same as an empty one: recorded so the
  // receipt is auditable, even though an early-stage feature legitimately
  // has not written every document yet (the feature directory itself
  // already had to exist, per confined() above).
  const missingArtifacts = artifacts.filter(([, info]) => !info.present).map(([name]) => name);
  const state = Object.fromEntries(artifacts.map(([name, { present, sha256, sent }]) => [name, { present, sha256, content: sent }]));
  const { apiKey } = await resolveApiKey({ workspace, env, keychain });
  let response;
  try {
    response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ model: 'jev-latest', state: JSON.stringify(state), questions: {
        goal_alignment: { type: 'choice', instructions: 'Does the current work remain aligned to the approved goal and specification?', criteria: { aligned: 'The work remains aligned.', partial: 'The work needs document reconciliation.', conflict: 'The work conflicts with approved direction.' } },
        specification_currency: { type: 'choice', instructions: 'Compare the supplied specification, plan, tasks, decisions, traceability, and change manifest. Are the stated implementation paths, completed-task status, commit evidence, and material changes internally consistent and current? Select partial only when you can identify a concrete missing or stale record.', criteria: { aligned: 'All supplied delivery records agree on the current implementation and no concrete stale or missing record is present.', partial: 'A concrete delivery record is missing, stale, or inconsistent and needs reconciliation.', conflict: 'The recorded implementation conflicts with the approved specification or decision.' } },
        test_coverage: { type: 'choice', instructions: 'Does the test specification map the changed behavior to executable owning-repository tests and any required eai-testing-dev release evidence?', criteria: { aligned: 'The changed behavior has complete executable coverage.', partial: 'The test evidence is incomplete or stale.', conflict: 'The test evidence contradicts the claimed behavior.' } },
        blast_radius: { type: 'choice', instructions: 'Does the change manifest and blast-radius report cover all affected interfaces, packages, release surfaces, dependencies, rollback paths, and external test contracts?', criteria: { aligned: 'The blast radius is complete and contained.', partial: 'The blast-radius evidence is incomplete or stale.', conflict: 'The reported blast radius conflicts with the changed surface.' } },
        required_action: { type: 'choice', instructions: 'Choose the action required by the four evidence judgments. Select continue when all four are aligned, reconcile when any is partial or evidence is missing, and ask_user only for a genuine conflict requiring a new business decision.', criteria: { continue: 'All four evidence judgments are aligned.', reconcile: 'At least one evidence judgment is partial or missing.', ask_user: 'A conflict requires a material user decision.' } },
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
  const specificationAnswer = answers.specification_currency || {};
  const testAnswer = answers.test_coverage || {};
  const blastRadiusAnswer = answers.blast_radius || {};
  const actionAnswer = answers.required_action || {};
  const alignment = normalizeAnswer(alignmentAnswer.choice);
  const specification = normalizeAnswer(specificationAnswer.choice);
  const testCoverage = normalizeAnswer(testAnswer.choice);
  const blastRadius = normalizeAnswer(blastRadiusAnswer.choice);
  const action = normalizeAnswer(actionAnswer.choice);
  // An invalid or out-of-range confidence must count as zero, not be
  // dropped: dropping it would let one bad value be outweighed by the
  // other, and an out-of-range value (e.g. 2) would otherwise satisfy the
  // minimum-confidence check on a malformed response.
  const confidences = [alignmentAnswer, specificationAnswer, testAnswer, blastRadiusAnswer, actionAnswer].map((answer) => {
    const value = Number(answer.confidence);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
  });
  const confidence = Math.min(...confidences);
  // An answer outside the known choice set fails toward reconcile, not
  // toward a silent aligned pass: an unexpected label must not be read as
  // "everything is fine".
  const evidenceAlignments = [alignment, specification, testCoverage, blastRadius];
  const recognized = evidenceAlignments.every((value) => KNOWN_ALIGNMENTS.has(value)) && KNOWN_ACTIONS.has(action);
  const missingRequiredEvidence = COMPLETE_EVIDENCE_EVENTS.has(event) && missingArtifacts.length > 0;
  const status = evidenceAlignments.includes('conflict') || action === 'ask_user' ? 'conflict'
    : !recognized || missingRequiredEvidence || confidence < policy.minimumConfidence || evidenceAlignments.includes('partial') || action === 'reconcile' ? 'reconcile'
    : 'aligned';
  const receipt = { schemaVersion: 2, provider: 'typesafe', event, status, confidence, missingArtifacts, missingRequiredEvidence, policySha256: digest(JSON.stringify(policy)), artifacts: Object.fromEntries(artifacts.map(([name, { sha256 }]) => [name, sha256])), answers: { goal_alignment: { choice: alignmentAnswer.choice || null, confidence: alignmentAnswer.confidence ?? null }, specification_currency: { choice: specificationAnswer.choice || null, confidence: specificationAnswer.confidence ?? null }, test_coverage: { choice: testAnswer.choice || null, confidence: testAnswer.confidence ?? null }, blast_radius: { choice: blastRadiusAnswer.choice || null, confidence: blastRadiusAnswer.confidence ?? null }, required_action: { choice: actionAnswer.choice || null, confidence: actionAnswer.confidence ?? null } } };
  const receiptRelativeDir = path.join('evidence', 'semantic-review');
  await assertNoSymlinkComponents(featureDir, receiptRelativeDir);
  const receiptDir = path.join(featureDir, receiptRelativeDir);
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${event}.json`);
  // A prior run's own receipt may already exist and must be replaced; a
  // symlink there must not be.
  await assertNotSymlink(receiptPath);
  const receiptHandle = await fs.open(receiptPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollowFlag, 0o600);
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
