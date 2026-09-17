/** Validate the EAI local-isolation contract for Gofer's new task worktree.
 * This is preflight evidence only. Native host invocation must still prove
 * that the effective sandbox remained enabled for the task. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const text = value => typeof value === 'string' && value.trim().length > 0;

export const LOCAL_ISOLATION_CONTRACT = 'eai.local-isolation/v1';

const HOST_SURFACES = Object.freeze({
  antigravity: 'antigravity-cli',
  claude: 'claude-cli',
  codex: 'codex-cli',
  copilot: 'copilot-cli',
  grok: 'grok-cli',
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
  const assessment = report.assessments.find(item => item?.surfaceId === surfaceId);
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
  run = execFileAsync } = {}) {
  const surfaceId = HOST_SURFACES[host];
  if (!surfaceId || !text(workspaceRoot) || !text(command) || typeof run !== 'function') {
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
  return report;
}
