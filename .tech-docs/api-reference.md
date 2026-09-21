---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Gofer API Reference

## API Surface Summary

| Surface | Transport | Consumer | Authentication |
| --- | --- | --- | --- |
| Native MCP server | JSON-RPC over stdio | MCP-compatible AI hosts | Host process trust; no Gofer login |
| Language server | LSP over stdio plus custom requests | VS Code extension | Local process/workspace trust |
| VS Code commands | Extension command registry | VS Code users/extensions | VS Code workspace trust |
| Node exports | ESM package exports `.` and `./headless` | Node automation | Local package access |

## Native MCP Interface

Start with `node dist/mcpServer.js --workspace-root /absolute/workspace`.
`--help` documents `--allow-write`, `--allow-execution`, and
`--allow-workspace-tools`. The server implements MCP `tools/list` and
`tools/call`; input schemas are defined in
`language-server/src/mcp/toolRegistry.ts` and exposed through
`MCP_TOOL_DEFINITIONS`.

All 29 tools are local-workspace operations. Required arguments are shown
below; optional arguments are omitted only where the source marks them
optional.

| Category | Tools | Required arguments |
| --- | --- | --- |
| Specs/tasks | `gofer_get_specs`, `gofer_get_next_task` | none |
| Task mutation | `gofer_execute_task`, `gofer_update_task_status` | `specId`, `taskId`; status is `pending`, `in_progress`, `testing`, `completed`, `failed`, or `blocked` |
| Validation | `gofer_validate_code` | `files: string[]` |
| Tests | `gofer_run_tests` | none; optional `path`, `filter`, backward-compatible `specId` |
| Research | `gofer_get_research_index`, `gofer_load_research_chunk` | `specId`; chunk load also `chunkId` |
| Handoff | `gofer_trigger_handoff` | `specId`; optional `reason` |
| Observations | `gofer_expand_observation`, `gofer_peek_observation` | `observationId` |
| Observation search/control | `gofer_fold_observation`, `gofer_grep_observations` | fold: `observationId`, `foldLevel`; grep: `pattern`, optional `maxResults` |
| Context | `gofer_context_peek`, `gofer_context_fold`, `gofer_context_expand` | `section` |
| Context search/history | `gofer_context_grep`, `gofer_context_undo`, `gofer_context_history` | grep: `pattern`; others none |
| Context batch | `gofer_context_repl` | `operations[]` |
| Diagnostics | `gofer_get_context_health`, `gofer_check_slop` | none; optional `includeBreakdown` or `path` |
| Workspace | `gofer_check_workspace`, `gofer_bootstrap_workspace` | optional `host`; bootstrap also optional `includeMirrors`, `dryRun` |
| Pipeline | `gofer_get_pipeline_state`, `gofer_start_stage` | start stage: `command`; optional `feature` |
| Branch/errors | `gofer_validate_branch`, `gofer_explain_eai_error` | explain: `codeOrReason`; branch optional `base` |
| Artifact read | `gofer_open_artifact` | `path`; optional `maxBytes` |

The native runtime validates arguments before dispatch, rejects unknown tools,
limits artifact reads to normalized documentation and Gofer spec/command paths,
limits responses to 2 MiB, serializes active work, and returns explicit
`isError` text results for permission, cancellation, and execution failures.

## LSP Interface

`language-server/src/server.ts` initializes incremental text-document sync,
completion resolve support, workspace-folder support, and an experimental MCP
tool list. Custom request and notification names are registered later in the
same file; the stable operational contract is the MCP registry above. Errors
use `ServerError`, `ValidationError`, and `NotFoundError` with codes such as
`INIT_ERROR`, `VALIDATION_ERROR`, and `NOT_FOUND`.

## VS Code Commands

The extension manifest registers commands including `gofer.run`,
`gofer.eai`, `gofer.initialize`, `gofer.upgrade`, `gofer.showProgress`,
`gofer.showDeliveryLineage`, `gofer.createSpec`, `gofer.openSpec`,
`gofer.executeAllPendingSpecs`, memory commands, context/usage commands,
`gofer.checkForUpdates`, `gofer.updateNow`, and `gofer.regenerateInstructions`.
The manifest is authoritative for the complete command list and titles.

## WebSockets and REST

No REST endpoints or WebSocket channels were found in the current source.
Communication is local LSP/MCP stdio and file-based artifacts.
