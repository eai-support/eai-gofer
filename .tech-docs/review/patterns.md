---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Patterns and Technical Debt

## Identified Patterns

| Pattern | Location | Use |
| --- | --- | --- |
| Dependency injection | `extension/src/di/`, `extension/src/services/` | Lifecycle and testable service composition |
| Registry/dispatcher | `language-server/src/mcp/toolRegistry.ts` | One discoverable and invokable MCP contract |
| Strategy/generator | `extension/src/council/`, `.specify/scripts/node/generate-commands.mjs` | Host-specific command mirrors from canonical stage files |
| Repository/file adapter | `language-server/src/utils/goferLoader.ts`, `mcp/workspaceAccess.ts` | Bounded, cached workspace reads |
| Observer/event-driven UI | `extension/src/fileMonitor.ts`, UI providers | Refresh views and state on workspace changes |
| Progressive context management | `extension/src/autonomous/` | Fold, mask, cache, and hand off context as usage rises |

## Technical Debt

| Item | Severity | Location | Recommendation |
| --- | --- | --- | --- |
| Large generated and mirrored resource tree | Medium | `.agents/`, `.github/`, `.claude/`, `plugins/`, `docs-site/static/releases/` | Continue source-of-truth generation and drift checks; avoid hand edits to mirrors. |
| Legacy compatibility surfaces | Medium | `.gemini/`, `enterpriseai` workflow profile, legacy docs | Keep migration boundaries explicit and remove only with a versioned deprecation plan. |
| Protocol contracts span legacy LSP and native MCP paths | Medium | `language-server/src/server.ts`, `mcpServer.ts` | Keep parity tests and prefer the native MCP registry for new tools. |
| Local logs may contain workspace context | Low | `.specify/logs/`, usage and audit writers | Maintain redaction and retention guidance; keep logs out of release artifacts. |

No `.specify/specs/{feature}` implementation specification exists in this
checkout, so spec-versus-implementation alignment is not determinable.
