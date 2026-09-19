#!/usr/bin/env node
/** Issue a live Codex receipt only with an activated local evaluator key. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodexAppServerRuntime, evaluateNativeHost,
  verifyCapabilityReceipt } from './gofer-host-capability.mjs';
import { inspectEaiLocalIsolation } from './gofer-local-isolation.mjs';
import { loadActiveCodexEvaluatorKey,
  resolveTrustedEvaluatorPublicKey } from './gofer-trusted-evaluator.mjs';

/** Issue and verify a live Codex capability receipt for one workspace. This is
 * the same production path `main` exposes as a CLI, extracted so a runtime
 * composition root can call it directly instead of shelling out. */
export async function issueLocalCapabilityReceipt({ workspaceRoot }) {
  if (!path.isAbsolute(workspaceRoot)) throw new Error('TRUSTED_EVALUATOR_REQUIRED');
  const isolation = await inspectEaiLocalIsolation({ host: 'codex', workspaceRoot });
  const session = await createCodexAppServerRuntime({ workspaceRoot,
    localIsolation: isolation }).inspect();
  let version;
  try {
    version = execFileSync(isolation.nativeExecutable, ['--version'],
      { encoding: 'utf8', timeout: 3000 }).trim();
  } catch { throw new Error('NATIVE_CODEX_CATALOG_REQUIRED'); }
  if (!version) throw new Error('NATIVE_CODEX_CATALOG_REQUIRED');
  // Finish every host subprocess before the private signing key enters memory.
  const { privateKey, keyId } = await loadActiveCodexEvaluatorKey({ workspaceRoot });
  const receipt = await evaluateNativeHost('codex', { signingKey: privateKey, keyId,
    runtime: { inspect: async () => session },
    run: async ({ program, args: versionArgs }) => ({
      ok: program === 'codex' && versionArgs?.length === 1 && versionArgs[0] === '--version',
      version,
    }) });
  const publicKey = await resolveTrustedEvaluatorPublicKey(receipt, { workspaceRoot });
  if (!verifyCapabilityReceipt(receipt, { publicKey, host: 'codex',
    requiredCapabilities: { isolationClass: 'git-worktree+local-os-sandbox' } })) {
    throw new Error('TRUSTED_EVALUATOR_REQUIRED');
  }
  return receipt;
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node gofer-local-capability-issuer.mjs --workspace <absolute-task-worktree>\n');
    return;
  }
  if (args.length !== 2 || args[0] !== '--workspace' || !path.isAbsolute(args[1])) {
    throw new Error('TRUSTED_EVALUATOR_REQUIRED');
  }
  const receipt = await issueLocalCapabilityReceipt({ workspaceRoot: args[1] });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
