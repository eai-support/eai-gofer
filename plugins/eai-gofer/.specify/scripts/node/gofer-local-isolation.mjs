/** Validate the EAI local-isolation contract before Gofer creates a worktree.
 * This is preflight evidence only. Native host invocation must still prove
 * that the effective sandbox remained enabled for the task. */
const text = value => typeof value === 'string' && value.trim().length > 0;

export const LOCAL_ISOLATION_CONTRACT = 'eai.local-isolation/v1';

const HOST_SURFACES = Object.freeze({
  antigravity: 'antigravity-cli',
  claude: 'claude-cli',
  codex: 'codex-cli',
  copilot: 'copilot-cli',
  grok: 'grok-cli',
});

export function verifyLocalIsolationReport(report, { host, workspaceRoot } = {}) {
  const surfaceId = HOST_SURFACES[host];
  if (!surfaceId || !text(workspaceRoot) || !report || report.contractVersion !== LOCAL_ISOLATION_CONTRACT ||
      report.cloudExecution !== 'prohibited' || report.gitRepository !== true || !text(report.projectDirectory) ||
      !Array.isArray(report.assessments)) return false;
  const assessment = report.assessments.find(item => item?.surfaceId === surfaceId);
  if (!assessment || assessment.status !== 'ready' || assessment.localOnly !== true ||
      assessment.requiresGitWorktree !== true || assessment.requiresOsSandbox !== true ||
      !Array.isArray(assessment.hostArguments) || assessment.hostArguments.some(value => !text(value)) ||
      !Array.isArray(assessment.missing) || assessment.missing.length !== 0) return false;
  const normalizedReportRoot = report.projectDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedWorkspace = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalizedReportRoot === normalizedWorkspace;
}
