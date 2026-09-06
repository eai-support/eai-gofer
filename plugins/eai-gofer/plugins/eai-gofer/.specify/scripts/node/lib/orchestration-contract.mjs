export function buildPortableOrchestrationContract() {
  return `## Portable Delegation

For \`/eai\`, inspect each meaningful stage (all 26; app/non-app).
Read and follow \`.specify/references/portable-orchestration.md\`.
Approved delegation runs automatically.
Ordinary chat/no useful delegation: stay native, no discovery/inference.
Preserve explicit disable, task model/budget and approvals.
CLI: \`node .specify/scripts/node/gofer-stage-execute.mjs --input REQUEST --execute --output NEW\`.
VS Code: native \`gofer_execute_stage\` with \`{request}\`; never substitute CLI.
Discover models for this host, client, account and profile before execution.
\`GOFER_STAGE_DELEGATE=1\`: no recursive dispatch. Read-only proposals;
controller applies authorized changes and runs all original checks. Planner is planning-only, off by default.`;
}
