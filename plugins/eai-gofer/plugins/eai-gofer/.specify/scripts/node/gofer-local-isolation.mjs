/** Validate the EAI local-isolation contract for Gofer's new task worktree.
 * This is preflight evidence only. Native host invocation must still prove
 * that the effective sandbox remained enabled for the task. */
import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, mkdtempSync, realpathSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const text = value => typeof value === 'string' && value.trim().length > 0;
// Observed on the local Codex CLI 0.154.0. A changed signing identity fails
// closed until the host contract is reviewed.
const CODEX_MACOS_SIGNATURE_REQUIREMENT =
  '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"';

function signedCodexExecutable() {
  if (process.platform !== 'darwin') return null;
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (!entry || !isAbsolute(entry)) continue;
    const candidate = join(entry, 'codex');
    try {
      accessSync(candidate, constants.X_OK);
      const executable = realpathSync(candidate);
      if (!statSync(executable).isFile()) return null;
      const signature = spawnSync('/usr/bin/codesign', ['--verify', '--strict', '--requirement',
        CODEX_MACOS_SIGNATURE_REQUIREMENT, executable], { stdio: 'ignore', timeout: 10000 });
      const identity = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', executable], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
      });
      if (signature.status !== 0 || signature.error || identity.status !== 0 ||
          !/\bTeamIdentifier=2DC432GLL2\b/.test(identity.stderr)) return null;
      return executable;
    } catch { /* Try the next PATH entry only when this one has no executable. */ }
  }
  return null;
}

/** An independent, no-model check of the executable Gofer will launch. */
export function probeNativeCodexSandbox(workspaceRoot) {
  const executable = signedCodexExecutable();
  if (!executable || !existsSync('/usr/bin/touch')) return null;
  let sibling;
  try { sibling = mkdtempSync(join(dirname(workspaceRoot), '.gofer-isolation-probe-')); }
  catch { return null; }
  const inside = join(workspaceRoot, `.gofer-isolation-probe-${randomUUID()}`);
  const outside = join(sibling, 'outside');
  const probe = target => spawnSync(executable,
    ['sandbox', '-P', ':workspace', '-C', workspaceRoot, '--', '/usr/bin/touch', target],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 16384 });
  try {
    const baseline = spawnSync('/usr/bin/touch', [outside], { stdio: 'ignore', timeout: 5000 });
    if (baseline.status !== 0 || !existsSync(outside)) return null;
    rmSync(outside);
    const allowed = probe(inside);
    if (allowed.status !== 0 || !existsSync(inside)) return null;
    const denied = probe(outside);
    return denied.status !== 0 && !denied.error && !existsSync(outside) &&
      /Operation not permitted|Permission denied/i.test(`${denied.stderr}\n${denied.stdout}`)
      ? executable : null;
  } catch { return null; }
  finally {
    rmSync(inside, { force: true });
    rmSync(outside, { force: true });
    try { rmdirSync(sibling); } catch { /* Preserve unexpected contents. */ }
  }
}

export const LOCAL_ISOLATION_CONTRACT = 'eai.local-isolation/v1';

const HOST_SURFACES = Object.freeze({
  codex: 'codex-cli',
});

function hasQualifiedHostArguments(host, args) {
  if (host !== 'codex' || !Array.isArray(args)) return false;
  const qualified = ['--sandbox', 'workspace-write'];
  const withApproval = [...qualified, '--ask-for-approval', 'never'];
  return [qualified, withApproval].some(expected =>
    args.length === expected.length && args.every((value, index) => value === expected[index]));
}

export function verifyLocalIsolationReport(report, { host, workspaceRoot } = {}) {
  const surfaceId = HOST_SURFACES[host];
  if (!surfaceId || !text(workspaceRoot) || !report || report.contractVersion !== LOCAL_ISOLATION_CONTRACT ||
      report.cloudExecution !== 'prohibited' || report.gitRepository !== true || !text(report.projectDirectory) ||
      !Array.isArray(report.assessments)) return false;
  const matchingAssessments = report.assessments.filter(item => item?.surfaceId === surfaceId);
  if (matchingAssessments.length !== 1) return false;
  const assessment = matchingAssessments[0];
  if (!assessment || assessment.status !== 'ready' || assessment.localOnly !== true ||
      assessment.requiresGitWorktree !== true || assessment.requiresOsSandbox !== true ||
      !hasQualifiedHostArguments(host, assessment.hostArguments) ||
      !Array.isArray(assessment.missing) || assessment.missing.length !== 0) return false;
  const normalizedReportRoot = report.projectDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedWorkspace = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalizedReportRoot === normalizedWorkspace;
}

/** Query the installed local EAI CLI for the worktree Gofer actually created. */
export async function inspectEaiLocalIsolation({ host, workspaceRoot, command = 'eai',
  run = execFileAsync, verifyNativeSandbox = probeNativeCodexSandbox } = {}) {
  const surfaceId = HOST_SURFACES[host];
  if (!surfaceId || !text(workspaceRoot) || !text(command) ||
      typeof run !== 'function' || typeof verifyNativeSandbox !== 'function') {
    throw new Error('LOCAL_SANDBOX_REQUIRED');
  }
  let stdout;
  try {
    ({ stdout } = await run(command,
      ['start', workspaceRoot, '--isolation-check', '--surface', surfaceId, '--format', 'json'],
      { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true }));
  } catch {
    throw new Error('LOCAL_SANDBOX_REQUIRED');
  }
  let report;
  try { report = JSON.parse(stdout); }
  catch { throw new Error('LOCAL_SANDBOX_REQUIRED'); }
  if (!verifyLocalIsolationReport(report, { host, workspaceRoot })) {
    throw new Error('LOCAL_SANDBOX_REQUIRED');
  }
  let nativeExecutable;
  try { nativeExecutable = verifyNativeSandbox(workspaceRoot); }
  catch { throw new Error('LOCAL_SANDBOX_REQUIRED'); }
  if (!text(nativeExecutable) || !isAbsolute(nativeExecutable)) throw new Error('LOCAL_SANDBOX_REQUIRED');
  return Object.freeze({ ...report, nativeExecutable });
}
