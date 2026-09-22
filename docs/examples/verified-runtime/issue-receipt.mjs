#!/usr/bin/env node
// Step: issue a fresh signed capability receipt through the production issuer.
//
//   node docs/examples/verified-runtime/issue-receipt.mjs \
//     --repo /abs/path/to/checkout --out /abs/path/receipt.json --ttl-minutes 240
//
// It creates a disposable verified task worktree, asks the EAI CLI for its
// isolation report, reads the live Codex model list, and signs the receipt with
// the active capability key. Nothing is spent.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { SCRIPTS, log, parseArgs, requireAbsolute } from './common.mjs';

const { createVerifiedWorktree, disposeVerifiedWorktree } = await import(`${SCRIPTS}/gofer-native-adapter.mjs`);
const { issueLocalCapabilityReceipt } = await import(`${SCRIPTS}/gofer-local-capability-issuer.mjs`);
const { inspectEaiLocalIsolation } = await import(`${SCRIPTS}/gofer-local-isolation.mjs`);

const args = parseArgs(process.argv.slice(2), ['repo', 'out', 'ttl-minutes']);
requireAbsolute(args, ['repo', 'out']);
const minutes = Number(args['ttl-minutes'] ?? 240);
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360) throw new Error('--ttl-minutes must be 1 to 360');

const probe = await createVerifiedWorktree({ workspaceRoot: args.repo, host: 'codex',
  localIsolation: inspectEaiLocalIsolation });
try {
  const receipt = await issueLocalCapabilityReceipt({ workspaceRoot: probe.isolatedWorkspace,
    ttlMs: minutes * 60 * 1000 });
  const file = await open(args.out, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await file.writeFile(JSON.stringify(receipt)); } finally { await file.close(); }
  log(`issued for ${receipt.models.map(model => model.id).join(', ')}`);
  log(`expires ${receipt.expiresAt}; written to ${path.basename(args.out)}`);
} finally {
  await disposeVerifiedWorktree({ workspaceRoot: probe.workspace, isolatedWorkspace: probe.isolatedWorkspace,
    revision: probe.revision, receipt: probe.receipt }).catch(error => log(`cleanup: ${error.message}`));
}
