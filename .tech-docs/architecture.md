---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Gofer Architecture

## System Context

```mermaid
flowchart TB
    User["Developer"]
    subgraph Hosts["AI and desktop hosts"]
        VSCode["VS Code"]
        Claude["Claude Code"]
        Codex["OpenAI Codex"]
        Copilot["GitHub Copilot"]
        Other["Antigravity / Grok Build"]
    end
    subgraph Gofer["Gofer repository"]
        Ext["VS Code extension"]
        LSP["LSP + MCP language server"]
        Orchestrator["Node autonomous orchestrator"]
        Headless["Headless contract library"]
        Surfaces["Generated host command surfaces"]
    end
    Workspace["Repository workspace<br/>.specify/ artifacts"]
    Providers["Provider CLI sessions/accounts"]
    User --> Hosts
    VSCode --> Ext
    Claude --> LSP
    Copilot --> Surfaces
    Codex --> Surfaces
    Other --> Surfaces
    Ext <--> LSP
    Orchestrator --> Workspace
    LSP --> Workspace
    Headless --> Workspace
    Ext --> Surfaces
    Hosts -. authenticated by host .-> Providers
```

## Representative Runtime Flow

```mermaid
sequenceDiagram
    participant U as Developer
    participant H as AI host
    participant M as MCP stdio server
    participant A as WorkspaceAccess
    participant F as .specify files
    participant V as Validator
    U->>H: Start `/eai` / host equivalent
    H->>M: tools/list
    M-->>H: 29 tool definitions and schemas
    H->>M: tools/call(gofer_get_specs)
    M->>A: Check workspace root and permissions
    A->>F: Read spec artifacts
    F-->>M: Markdown/JSON content
    M-->>H: JSON text result
    H->>M: tools/call(gofer_validate_code)
    M->>V: Validate requested files/contracts
    V->>F: Read constitution and pipeline artifacts
    V-->>M: Structured result
    M-->>H: Result or explicit error
```

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Extension host | `extension/src/extension.ts` | Activates on startup/view use, registers commands and providers, starts LSP client, and manages workspace state. |
| Extension services | `extension/src/services/` | Configuration, migration, resource sync, lifecycle, logging, and workflow contracts. |
| Autonomous subsystem | `extension/src/autonomous/` | Context compaction, memory, cost/usage tracking, scope guard, audit, task graph, and progress. |
| Command council | `extension/src/council/` | Detects host and generates Claude/Codex/Copilot/Antigravity/Grok/VS Code surfaces from canonical commands. |
| Language server | `language-server/src/server.ts` | LSP initialization, workspace loading, custom requests, and experimental MCP compatibility. |
| Standalone MCP runtime | `language-server/src/mcpServer.ts` | Native MCP `tools/list` and `tools/call` over stdio with schema validation and permission gates. |
| Tool registry/handler | `language-server/src/mcp/` | Defines the 29 tools, dispatches calls, checks access, and executes workspace operations. |
| Orchestrator | `src/orchestrator/` | CLI-driven task queue and autonomous execution over spec directories. |
| Headless contracts | `src/headless/` | Release, audit, handoff, export-bundle, validation, and delivery-lineage contracts. |

## Data and Control Flow

```mermaid
flowchart TB
    Request["User request"]
    Canonical[".specify/commands/*.md"]
    Generated["Host mirrors:<br/>.claude / .agents / .github / .grok"]
    Stage["Pipeline stage"]
    Artifacts["spec.md, research.md, plan.md,<br/>tasks.md, validation outputs"]
    Memory[".specify/memory/<br/>core, recall, archival, observations"]
    Logs[".specify/logs/<br/>audit, usage, run ledger"]
    Request --> Canonical --> Generated
    Request --> Stage --> Artifacts
    Stage <--> Memory
    Stage --> Logs
    Artifacts --> Stage
```

## Design Patterns and Boundaries

- **Dependency injection:** `tsyringe` wires extension services through
  `extension/src/di/`.
- **Registry/dispatcher:** `TOOL_REGISTRY` co-locates MCP metadata and handler
  dispatch, so discovery and invocation share one contract.
- **Repository/file adapter:** `GoferLoader`, `SpecLoader`, and
  `WorkspaceAccess` centralize bounded file access and caching.
- **Strategy/generator:** canonical stage contracts emit multiple host-specific
  surfaces.
- **Observer/event model:** VS Code events and `chokidar` watchers refresh UI,
  specs, memory, and generated resources.

## Trust, Authentication, and Authorization

Gofer has no hosted authentication layer. Provider login is delegated to each
host/CLI. The standalone MCP runtime requires an explicit absolute
`--workspace-root`; default startup permits bounded artifact reads only.
`--allow-write` and `--allow-execution` are narrow startup permissions, while
`--allow-workspace-tools` enables legacy broad tools. These are trusted process
startup decisions, not model-controlled arguments, and the runtime explicitly
states it is not an OS sandbox.

Additional controls include path traversal checks, normalized artifact allowlists,
JSON-schema validation, one active MCP call at a time, cancellation handling,
ScopeGuard protected-file modes, and local tool-audit logging. Secrets are
expected in provider sessions, shell/CI secret stores, or ignored `.env` files.
