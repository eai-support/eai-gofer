---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Gofer Configuration

## Configuration Sources

1. VS Code user/workspace settings from `extension/package.json`.
2. Spec frontmatter and `.specify/memory/gofer-model-policy.yaml`.
3. Environment variables and optional `.env`.
4. Hardcoded component defaults.

Provider credentials are not Gofer settings. Use provider login/session state,
shell environment, CI secret stores, or an ignored `.env`; never commit values.

## VS Code Settings

| Setting | Type | Default | Purpose |
| --- | --- | --- | --- |
| `gofer.autoInitialize` | boolean | `false` | Offer to create the Gofer scaffold on workspace open |
| `gofer.preferredAI` | enum | `ask` | Preferred send-task route: `claude`, `copilot`, or `ask` |
| `gofer.cliProvider` | enum | `auto` | Autonomous CLI: `claude`, `codex`, or `auto` |
| `gofer.defaultCLI` | enum | `auto` | Host routing: `claude`, `codex`, `copilot`, `antigravity`, `grok`, `vscode`, or `auto` |
| `gofer.workflowProfile` | enum | `standard` | Public workflow; `enterpriseai` is migration-only compatibility |
| `gofer.claudeCodeCommand` | string | `claude` | Claude executable/path |
| `gofer.codexCommand` | string | `codex` | Codex executable/path |
| `gofer.markdownViewer` | enum | `preview` | `preview`, `mark-sharp`, `markdown-editor`, or `markdown-wysiwyg` |
| `gofer.observationPreservePatterns` | string[] | `[]` | Case-insensitive patterns never masked during context compaction |
| `gofer.useLayeredMemory` | boolean | `false` | Enable core/recall/archival memory |
| `gofer.stageDetectionStalenessMinutes` | number | `30` | Cached stage freshness; allowed range 5–120 |
| `gofer.aiUsage.statusBar.enabled` | boolean | `true` | Show usage cost status item |
| `gofer.aiUsage.polling.interval` | number | `3600000` | Fallback usage polling interval in milliseconds; range 1000–7200000 |

## Environment Variables

| Variable | Default | Used by | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | `info` | root logger | `debug`, `info`, `warn`, or `error` |
| `SPEC_DIR` | `<cwd>/.specify/specs` | `src/index.ts` | Orchestrator spec directory |
| `WORKSPACE_DIR` | current directory | `src/index.ts` | Orchestrator workspace root |
| `SPECS_DIR` | `.specify/specs` | `.env.example`/legacy config | Alternate documented spec-dir name |
| `MAX_RETRIES` | `3` | `.env.example`/orchestrator config | Retry budget documented for local runtime |
| `CLAUDE_PROJECT_DIR` | current directory | Claude hooks/UI | Project directory for host integration |
| `GOFER_PROJECT_DIR` | current directory | hooks | Project directory override |
| `GOFER_QUEUE_FILE` | derived path | queued-input hook | Queue file override |
| `GOFER_LOG_FILE` | derived path | stage-launch hook | Stage log override |
| `GOFER_STAGE` | CLI argument or `unknown` | stage-launch hook | Stage label |
| `GOFER_MODE` | `numbered` | stage-launch hook | Invocation mode |
| `GOFER_PERF_LOG` / `GOFER_PERF_MODE` | unset | hooks | Enable performance logging when `1` |
| `RUN_LIVE_NETWORK_TESTS` | unset | extension E2E | Enable live network tests only when `1` |
| `SKIP_NETWORK_TESTS` | unset | extension E2E | Disable network tests |
| `VSCODE_TEST_VERSION` | `1.127.0` | extension test runner | VS Code test version |
| `TYPESAFE_API_KEY` | unset | optional credential helper | Typesafe helper credential; value must not be documented or committed |

## Secrets and Feature Flags

Required credentials are host/provider-managed and names are intentionally not
given values. CI release publishing uses GitHub's `GITHUB_TOKEN` and repository
variables `VSCE_AZURE_CLIENT_ID`, `VSCE_AZURE_TENANT_ID`, and
`VSCE_AZURE_SUBSCRIPTION_ID`. No runtime feature-flag service was found.
