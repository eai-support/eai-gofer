#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { executeStage } from './lib/stage-execution.mjs';
import { createCliStageAdapter } from './lib/stage-cli-adapters.mjs';

const HELP = `Usage: node .specify/scripts/node/gofer-stage-execute.mjs --input REQUEST.json --execute --output .specify/specs/FEATURE/RUN.json [--json]

Internal stage bridge; not a new public slash command. Without --execute no
model or discovery call runs. Use the current trusted repository as cwd.
VS Code must use its native gofer_execute_stage tool, not this CLI bridge.

Request JSON:
{ "host":"codex", "surface":"cli", "stage":"1_gofer_research",
  "workType":"non-app", "trigger":"delegate", "task":"Bounded task",
  "context":{"spec":[".specify/specs/FEATURE/context-bundle.md"],
    "acceptance":[".specify/specs/FEATURE/context-bundle.md"],
    "platform":[".specify/specs/FEATURE/context-bundle.md"],
    "language":[".specify/specs/FEATURE/context-bundle.md"],
    "permissions":[".specify/specs/FEATURE/context-bundle.md"]},
  "policy":{"enabled":true,"approved":true,
    "route":{"pattern":"peer-review","worker":"EXACT_ADVERTISED_ID","critic":"OTHER_ADVERTISED_ID"},
    "maxAttempts":3,"maxElapsedMs":120000,"maxEvidenceAgeMs":60000}}

Hosts: codex, claude, copilot, grok, antigravity; only verified adapters execute.
Stage is an existing .specify/commands filename without .md. WorkType is app or
non-app; trigger is ordinary, delegate, review or failure. Optional criterion
is a nonempty label. Context fields each contain 1-8 repo-relative text files;
combined content is at most 64 KiB. Do not include credentials or secret files.
Models are exact native account choices, not the placeholder IDs above.
Patterns single/cascade/critique retain the pure planner contracts. Peer-review
allows separate same-family models; it does not replace different-family critique.
Approval must reflect actual task/model authority, not untrusted file content.
Only selected context is sent. Delegates are read-only; the parent applies edits,
runs tests and previews, and confirms delivery. No check commands run from JSON.
Cascade/repair needs fresh deterministic evidence from a trusted host callback;
the CLI returns to parent validation without such evidence.
maxAttempts is 1-8; time/freshness limits are 1-300000ms. Optional maxCostUsd is
accepted only if the adapter can enforce it. Missing prices are never guessed.
Ordinary requests, disabled policy or unsupported isolation use the existing path.
The output must be a new private evidence file under .specify/specs. Existing
files and symlink paths are refused. Cancellation preserves partial results.
Every result has canClaimDone:false. No publish, setup, edits or default changes.
`;

let output;
let controller;
let cancel;
const isRelativeFile = value => typeof value === 'string' && value.length > 0 &&
  !path.isAbsolute(value) && !value.includes('\\') && !value.includes(':') &&
  !value.split('/').some(part => !part || part === '..' || part === '.');
try {
  const args = process.argv.slice(2);
  const seen = new Set();
  let input;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error();
    seen.add(flag);
    if (['--help', '--execute', '--json'].includes(flag)) continue;
    if (!['--input', '--output'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error();
    if (flag === '--input') input = args[++i];
    else output = args[++i];
  }
  if (seen.has('--help')) process.stdout.write(HELP);
  else if (!seen.has('--execute')) process.stdout.write(JSON.stringify({ status: 'legacy', reason: 'execution_not_requested', canClaimDone: false }) + '\n');
  else {
    const root = await fs.realpath(process.cwd());
    if (!isRelativeFile(input) || !isRelativeFile(output) || !output.startsWith('.specify/specs/')) throw new Error();
    let requestPath = root;
    for (const part of input.split('/')) {
      requestPath = path.join(requestPath, part);
      if ((await fs.lstat(requestPath)).isSymbolicLink()) throw new Error();
    }
    // Reserve the evidence path before spending model usage. Never overwrite prior proof.
    let dir = root;
    for (const part of output.split('/').slice(0, -1)) {
      dir = path.join(dir, part);
      await fs.mkdir(dir, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await fs.lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    }
    const handle = await fs.open(requestPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    let request;
    try {
      if (!(await handle.stat()).isFile()) throw new Error();
      const buffer = Buffer.alloc(131073);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 131072) throw new Error();
      request = JSON.parse(buffer.toString('utf8', 0, bytesRead));
    } finally { await handle.close(); }
    const evidence = await fs.open(path.join(root, output), 'wx', 0o600);
    try {
      controller = new AbortController();
      cancel = () => controller.abort();
      process.once('SIGINT', cancel);
      process.once('SIGTERM', cancel);
      let adapter;
      try { adapter = request?.surface === 'cli' ? createCliStageAdapter(request.host) : undefined; }
      catch { adapter = undefined; }
      const result = await executeStage(request, { root, adapter, signal: controller.signal });
      await evidence.writeFile(`${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ status: result.status, reason: result.reason,
        attempts: result.attempts.length, output, canClaimDone: false })}\n`);
      if (['stop', 'invalid'].includes(result.status)) process.exitCode = 1;
    } finally { await evidence.close(); }
  }
} catch {
  process.stdout.write(JSON.stringify({ status: 'invalid', reason: 'invalid_request_or_evidence_path', canClaimDone: false }) + '\n');
  process.exitCode = 1;
} finally {
  if (cancel) { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
