#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { planOrchestration } from './lib/portable-orchestration.mjs';

const HELP = `Usage: node .specify/scripts/node/gofer-orchestration.mjs [--input <path>] [--json]

Options:
  --input <path>  Read a JSON snapshot from a trusted host adapter.
  --json          Print the complete decision as JSON.
  --help          Show this help without reading input.

No input or a disabled policy retains the legacy path. This helper only plans:
no provider calls, file writes, credentials, shell execution or completion claims.
Required enabled snapshot (all times are epoch milliseconds):
  policy: {enabled:true, approved:true, route:{pattern, worker, escalator?, critic?},
           maxAttempts, maxElapsedMs, maxEvidenceAgeMs, maxCostUsd?}
  host, nowMs, startedAtMs, cancelled, revision, criterion
  context: {spec:[ref], acceptance:[ref], platform:[ref], language:[ref], permissions:[ref]}
  capabilities: {host, verified:true, observedAtMs, modelSelection:true,
                 readOnlyIsolation, models:[{id, family, available, nativeCompound}]}
  attempts: [], evidence: []
Each attempt: {id, phase, modelId, family, revision, criterion, status,
               startedAtMs, finishedAtMs?, usage?}
  phase: worker | escalator | critic | repair | synthesis | validation
  status: succeeded | failed | running | cancelled | timed_out
  revision/criterion identify resulting work. Ledger is sequential and complete.
  finishedAtMs is required except for the last, still-running attempt.
  usage: {inputTokens?, cachedInputTokens?, outputTokens?, costUsd?}
  Missing/null metrics remain unknown. Input includes cache when reported;
  cachedInputTokens is informational, never added again or used to guess prices.
Each evidence item: {ref, attemptId, revision, criterion, kind, status,
                     deterministic, observedAtMs}
  kind: test | lint | typecheck | acceptance | confidence | review
  status: pass | fail | blocked | unknown
  Escalation/repair requires the unique latest failed deterministic check for
  the active revision/criterion, linked to the last attempt and recorded after it.
  A review opinion alone returns to existing validation, not an unchecked edit.
All strings are nonempty, trimmed, at most 512 characters. Context requires 1-8
refs per field, including a specification/decision record for non-app work.
Clocks/token counts are nonnegative safe integers; attempt/time/freshness limits
are positive safe integers. Cost is finite, nonnegative, at most MAX_SAFE_INTEGER.
Unknown fields and malformed input fail closed. Required flags are booleans.
Capability/check evidence must be no older than maxEvidenceAgeMs and not future.
maxCostUsd is optional: unknown spent cost stops with cost_unknown; spent >= limit
stops with cost_limit. Every action supplies remainingCostUsd (null if uncapped).
Patterns: single, cascade, critique, peer-review. Peer-review needs distinct models
and read-only isolation, but does not certify different-family independence.
Critique retains its stronger different-family gate. Route model IDs must exactly match capability
evidence; no model IDs are built in. Disabled example: {"policy":{"enabled":false}}
Native compound workers use single; native compound companion roles use legacy,
not an omitted critic/escalator or a second loop. No internal review is certified.
host is a canonical adapter identity shared by CLI/desktop, not a surface whitelist.
Pass every attempt on each call; elapsed time spans all phases from startedAtMs.
Host assertions are not cryptographic proof. The existing host executes decisions
and enforces isolation and limits; this helper guarantees no runtime behaviour.
Original risk floors, mandatory checks and approval obligations remain unchanged.
readOnly is an additional restriction: false never grants write access.
Output: {status, reason, pattern, action, usage, canClaimDone:false}.
status: legacy | delegate | stop | wait | validate | invalid. Only delegate has an
action: {role, phase, modelId, family, readOnly, inheritContext:false, context,
         revision, criterion, evidenceRef, limits:{remainingAttempts, remainingMs,
         remainingCostUsd}}. usage has attempts, total, reported and byPhase;
total is null per missing metric; reported is the known subtotal, not a full bill.
`;

const args = process.argv.slice(2);
try {
  let inputPath;
  let json = false;
  let help = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (seen.has(arg)) throw new TypeError('Duplicate option');
    seen.add(arg);
    if (arg === '--json') json = true;
    else if (arg === '--help') help = true;
    else if (arg === '--input' && args[i + 1] && !args[i + 1].startsWith('--')) inputPath = args[++i];
    else throw new TypeError('Unknown option or missing --input path');
  }
  if (help) process.stdout.write(HELP);
  else {
    const input = inputPath === undefined ? undefined : JSON.parse(await readFile(inputPath, 'utf8'));
    const output = planOrchestration(input);
    process.stdout.write(json ? `${JSON.stringify(output)}\n` : `${output.status}: ${output.reason}. Planning only; delivery remains unverified.\n`);
    if (output.status === 'invalid') process.exitCode = 1;
  }
} catch {
  // Do not echo input content, paths or parser errors that may expose sensitive data.
  const output = { status: 'invalid', reason: 'Invalid arguments or unreadable JSON input', pattern: null, action: null, usage: null, canClaimDone: false };
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(output)}\n` : `${output.reason}\n`);
  process.exitCode = 1;
}
