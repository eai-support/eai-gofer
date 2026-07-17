---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - Architecture

## Executive Summary

Gofer implements a dual-protocol architecture (LSP + MCP) that bridges VSCode
Extension API with AI assistant tools. The system uses dependency injection
(tsyringe) for service lifecycle management and follows a progressive context
management strategy through Adaptive Context Compaction (ACC). Trust boundaries
are enforced via ScopeGuard, and all tool invocations are audited to
`.specify/logs/tool-audit.jsonl`.

## High-Level System Context

```mermaid
flowchart TB
    subgraph "User Environment"
        VSCode["VS Code IDE"]
        User["Developer"]
    end

    subgraph "Gofer Extension"
        ExtHost["Extension Host<br/>(extension.ts)"]
        LSPClient["LSP Client<br/>(lspClient.ts)"]
        UI["UI Providers<br/>Progress, AI Usage, Memory"]
        StateManager["State Manager<br/>(Global State)"]
        ACCOrch["ACC Orchestrator<br/>(Context Management)"]
    end

    subgraph "Language Server"
        LSPServer["Language Server<br/>(server.ts)"]
        MCPHandler["MCP Tool Handler<br/>(23 tools)"]
        GoferLoader["Gofer Loader<br/>(Spec Cache)"]
    end

    subgraph "AI Assistants"
        Claude["Claude Code CLI"]
        Copilot["GitHub Copilot Chat"]
        Codex["OpenAI Codex CLI"]
        Gemini["Gemini CLI"]
    end

    subgraph "File System"
        Specify[".specify/<br/>specs, memory, logs"]
        Generated["Generated Commands<br/>.claude, .github, .agents, .gemini"]
    end

    subgraph "External Services"
        ClaudeService["Claude provider service<br/>(via Claude Code CLI)"]
        GeminiService["Gemini provider service<br/>(via Gemini CLI)"]
        CodexService["OpenAI provider service<br/>(via Codex CLI)"]
    end

    User -->|Uses| VSCode
    VSCode -->|Hosts| ExtHost
    ExtHost -->|Communicates| LSPClient
    LSPClient <-->|LSP Protocol| LSPServer
    ExtHost -->|Updates| UI
    ExtHost -->|Manages| StateManager
    ExtHost -->|Orchestrates| ACCOrch

    LSPServer -->|Handles Tools| MCPHandler
    LSPServer -->|Loads Specs| GoferLoader
    MCPHandler -->|Reads/Writes| Specify
    GoferLoader -->|Reads| Specify

    Claude -->|MCP Tools| LSPServer
    Copilot -->|Reads| Generated
    Codex -->|Reads| Generated
    Gemini -->|Reads| Generated

    ExtHost -->|Generates| Generated
    Claude -->|Provider account| ClaudeService
    Gemini -->|Provider account| GeminiService
    Codex -->|Provider account| CodexService
```

## Runtime Flow: Feature Implementation

```mermaid
sequenceDiagram
    participant User
    participant ClaudeCode as Claude Code CLI
    participant LSP as Language Server
    participant MCP as MCP Handler
    participant FS as File System (.specify/)
    participant Extension as VS Code Extension

    User->>ClaudeCode: /eai Add auth
    ClaudeCode->>LSP: MCP: tools/call("gofer_read_spec")
    LSP->>MCP: Route to tool handler
    MCP->>FS: Read .specify/specs/*/spec.md
    FS-->>MCP: Return spec data
    MCP-->>LSP: Return JSON response
    LSP-->>ClaudeCode: Spec content

    ClaudeCode->>LSP: MCP: tools/call("gofer_research")
    MCP->>FS: Write research.md
    MCP->>Extension: Notify progress update
    Extension->>User: Show progress in sidebar

    ClaudeCode->>LSP: MCP: tools/call("gofer_create_plan")
    MCP->>FS: Write plan.md

    ClaudeCode->>LSP: MCP: tools/call("gofer_execute_task")
    MCP->>FS: Update tasks.md status
    MCP->>FS: Log to tool-audit.jsonl

    ClaudeCode->>LSP: MCP: tools/call("gofer_validate_code")
    MCP->>FS: Write validation results
    MCP-->>ClaudeCode: Validation report

    ClaudeCode-->>User: Implementation complete
    Extension->>User: Update progress: ● Complete
```

## Component Architecture

### Extension Layer (extension/src/)

```mermaid
flowchart TB
    subgraph "Extension Entry Point"
        Activate["activate()<br/>extension.ts"]
        DI["Dependency Injection<br/>tsyringe container"]
    end

    subgraph "Core Services"
        Config["ConfigManager<br/>settings.json"]
        State["StateManager<br/>workspace state"]
        Logger["Logger<br/>winston"]
        Disposals["DisposalService<br/>cleanup"]
    end

    subgraph "Autonomous Features"
        ACC["ACCOrchestrator<br/>Context management"]
        Memory["MemoryManager<br/>3-layer system"]
        ScopeGuard["ScopeGuard<br/>File protection"]
        Audit["ToolAuditLogger<br/>MCP audit log"]
        Budget["CostBudgetEnforcer<br/>Cost tracking"]
    end

    subgraph "UI Components"
        Progress["ProgressProvider<br/>Spec progress tree"]
        AIUsage["AIUsageProvider<br/>Token usage panel"]
        MemoryUI["MemoryProvider<br/>Memory tree view"]
        StatusBar["Context Health<br/>Status bar"]
    end

    subgraph "Command Generation"
        Router["CLI Provider Router<br/>Surface selection"]
        CommandGen["CrossPlatformCommandRouter<br/>CLI surface generation"]
    end

    Activate --> DI
    DI --> Config
    DI --> State
    DI --> Logger
    DI --> Disposals

    Activate --> ACC
    Activate --> Memory
    Activate --> ScopeGuard
    Activate --> Audit
    Activate --> Budget

    Activate --> Progress
    Activate --> AIUsage
    Activate --> MemoryUI
    Activate --> StatusBar

    Activate --> Router
    Activate --> CommandGen
```

### Language Server Layer (language-server/src/)

```mermaid
flowchart LR
    subgraph "Server Core"
        Connection["LSP Connection<br/>vscode-languageserver"]
        Init["onInitialize<br/>Capability registration"]
    end

    subgraph "MCP Tools (23 tools)"
        SpecTools["Spec Management<br/>read_spec, create_spec"]
        TaskTools["Task Execution<br/>execute_task, query_tasks"]
        MemoryTools["Memory Operations<br/>query_memory, store_memory"]
        ContextTools["Context Management<br/>peek, grep, fold, expand"]
        ValidationTools["Validation<br/>validate_code, run_tests"]
    end

    subgraph "Utilities"
        GoferLoader["GoferLoader<br/>Spec caching"]
        SpecCache["SpecCache<br/>Performance optimization"]
        ResearchChunker["ResearchChunker<br/>Memory-first loading"]
        ValidationSvc["ValidationService<br/>Code quality checks"]
    end

    Connection --> Init
    Init --> SpecTools
    Init --> TaskTools
    Init --> MemoryTools
    Init --> ContextTools
    Init --> ValidationTools

    SpecTools --> GoferLoader
    SpecTools --> SpecCache
    TaskTools --> ResearchChunker
    ValidationTools --> ValidationSvc
```

## Data Flow Diagrams

### Spec-to-Implementation Flow

```mermaid
flowchart TB
    Start["User asks<br/>/eai ..."]

    subgraph "Research Phase"
        Research["Generate research.md<br/>Codebase analysis"]
        ResearchStore["Store in .specify/specs/*/"]
    end

    subgraph "Specification Phase"
        Specify["Generate spec.md<br/>Requirements + Acceptance Criteria"]
        SpecStore["Store with YAML frontmatter"]
    end

    subgraph "Planning Phase"
        Plan["Generate plan.md<br/>Architecture + Contracts"]
        DataModel["Generate data-model.md<br/>ERD diagrams"]
        PlanStore["Store planning artifacts"]
    end

    subgraph "Tasks Phase"
        Tasks["Generate tasks.md<br/>Dependency-ordered"]
        Traceability["Generate traceability.md<br/>Task-to-spec mapping"]
        TaskStore["Store task breakdown"]
    end

    subgraph "Implementation Phase"
        Execute["Execute tasks<br/>Code changes"]
        Validate["Run validation<br/>6 parallel agents"]
        AuditLog["Log to tool-audit.jsonl"]
    end

    Start --> Research
    Research --> ResearchStore
    ResearchStore --> Specify
    Specify --> SpecStore
    SpecStore --> Plan
    Plan --> DataModel
    DataModel --> PlanStore
    PlanStore --> Tasks
    Tasks --> Traceability
    Traceability --> TaskStore
    TaskStore --> Execute
    Execute --> Validate
    Validate --> AuditLog
```

### Context Health Management

```mermaid
flowchart TB
    subgraph "Context Monitoring"
        Monitor["Context Health Monitor<br/>Polls every 30s"]
        State["context-health-state.json<br/>30s TTL cache"]
    end

    subgraph "ACC Stages"
        S70["70% - Delegation Advisory"]
        S80["80% - Observation Masking"]
        S85["85% - Fast Pruning"]
        S90["90% - Aggressive Masking"]
        S99["99% - Full Compaction"]
    end

    subgraph "Actions"
        Delegate["Suggest subagent delegation"]
        Mask["Mask old observations (5+ turns)"]
        Prune["Truncate budget cap"]
        Compact["Compact all observations"]
        Save["Auto-save session checkpoint"]
    end

    Monitor --> State
    State --> S70
    S70 -->|>70%| Delegate
    S70 --> S80
    S80 -->|>80%| Mask
    S80 --> S85
    S85 -->|>85%| Prune
    S85 --> S90
    S90 -->|>90%| Compact
    S90 --> S99
    S99 -->|>99%| Save
```

## Key Design Patterns

### 1. Dependency Injection (tsyringe)

- **Pattern:** Constructor injection with decorators
- **Location:** `extension/src/di/`, `extension/src/services/`
- **Purpose:** Service lifecycle management, testability, loose coupling
- **Example:**

```typescript
@injectable()
export class StateManager {
  constructor(
    @inject('Logger') private logger: Logger,
    @inject('ConfigManager') private config: ConfigManager
  ) {}
}
```

### 2. Provider Pattern (VS Code Tree Views)

- **Pattern:** Data provider with refresh notifications
- **Location:** `extension/src/progressProvider.ts`, `extension/src/ui/`
- **Purpose:** Reactive UI updates for spec progress, AI usage, memory
- **Example:** `ProgressProvider implements vscode.TreeDataProvider<SpecNode>`

### 3. Event-Driven Architecture

- **Pattern:** Event emitters for state changes
- **Location:** Throughout extension and language server
- **Purpose:** Decoupled communication between components
- **Example:** `onDidChangeConfiguration`, `onDidChangeState`

### 4. Repository Pattern

- **Pattern:** File-based data access abstraction
- **Location:** `language-server/src/utils/goferLoader.ts`
- **Purpose:** Centralized spec and memory access with caching
- **Example:** `GoferLoader.loadSpec()`, `GoferLoader.listSpecs()`

### 5. Strategy Pattern (CLI Command Generation)

- **Pattern:** Multiple output formats from single source
- **Location:** `extension/src/council/CrossPlatformCommandRouter.ts`
- **Purpose:** Generate Claude, Copilot, Codex, Gemini commands from canonical
  source
- **Example:** Single `.specify/commands/*.md` → 4 CLI surfaces

### 6. Observer Pattern (File Watching)

- **Pattern:** chokidar file system observers
- **Location:** `extension/src/fileMonitor.ts`
- **Purpose:** React to spec changes, memory updates, log files
- **Example:** Watch `.specify/specs/*/spec.md` for changes

### 7. Decorator Pattern (Tool Audit Logging)

- **Pattern:** Wrap MCP tool calls with audit logging
- **Location:** `extension/src/autonomous/ToolAuditLogger.ts`
- **Purpose:** Log all file access operations to JSONL
- **Example:** Every MCP tool call logged with timestamp, operation, files
  accessed

## Trust Boundaries and Security

### Authentication Flow

No Gofer-specific authentication is required. Gofer operates locally within the
VS Code workspace and delegates AI access to Claude, Codex, Copilot, and Gemini
through each tool's normal login or app session.

### Authorization Controls

**ScopeGuard** enforces file access restrictions defined in specs:

- **Advisory Mode:** Logs warnings when AI accesses protected files
- **Warning Mode:** Prompts user before allowing access
- **Blocking Mode:** Prevents AI from accessing protected files entirely

Protected files defined in spec frontmatter:

```yaml
protected_files:
  - 'src/auth/*.ts'
  - '.env'
  - 'secrets/'
```

### Security Controls

1. **Tool Audit Logging** - All MCP tool invocations logged to
   `.specify/logs/tool-audit.jsonl`
2. **Model Policy Guidance** - `.specify/memory/gofer-model-policy.yaml`
   documents routing and cost tradeoffs
3. **Environment Variable Validation** - `.env` files ignored by git, never
   committed
4. **Credential Delegation** - Gofer does not store provider API keys in VS Code
   settings
5. **File System Sandboxing** - MCP tools restricted to workspace directory
6. **Input Validation** - Zod schemas validate all MCP tool inputs

### Data Sensitivity

- **Low Sensitivity:** Specifications, plans, tasks (intended for version
  control)
- **Medium Sensitivity:** Memory observations (may contain code snippets)
- **High Sensitivity:** API keys and tokens managed by provider CLIs, shell
  secrets, or external secret managers (never logged or committed)

## Integration Points

### VS Code Extension API

- **Commands:** 67+ registered commands via `contributes.commands`
- **Views:** 3 tree views (Progress, AI Usage, Memory)
- **Status Bars:** 2 status bar items (Context Health, AI Usage)
- **Configuration:** 13 settings via `contributes.configuration`
- **Language Server:** Stdio transport via `LanguageClient`

### Model Context Protocol (MCP)

- **Tools:** 23 tools exposed via LSP custom requests
- **Transport:** LSP stdio (vs. HTTP or WebSocket)
- **Tool Discovery:** `tools/list` request
- **Tool Execution:** `tools/call` request with JSON-RPC 2.0 format

### AI Assistant Integrations

| Assistant      | Integration Method | Command Discovery         | Tool Access           |
| -------------- | ------------------ | ------------------------- | --------------------- |
| Claude Code    | MCP via LSP        | `.claude/commands/`       | Direct (23 tools)     |
| GitHub Copilot | Prompt files       | `.github/prompts/`        | Indirect (files only) |
| OpenAI Codex   | Skill files        | `.agents/skills/`         | Indirect (files only) |
| Gemini CLI     | Command files      | `.gemini/commands/gofer/` | Indirect (files only) |

### External Service Integrations

- **AI CLIs:** Claude, Codex, Copilot, and Gemini use their normal CLI or app
  authentication flows
- **GitHub API:** Optional, for auto-update checking

## Performance Characteristics

### Context Management

- **Spec Cache:** In-memory caching with 60s freshness TTL
- **Research Chunking:** On-demand loading, 30% memory coverage threshold
- **Observation Masking:** Triggered at 80% context utilization
- **Full Compaction:** Triggered at 99% context utilization

### File System Operations

- **Spec Loading:** Cached after first read, invalidated on file change
- **Memory Queries:** TF-IDF indexed, O(n log n) retrieval
- **Log Writing:** Append-only JSONL, no blocking
- **File Watching:** Debounced with 300ms delay

### Provider Rate Limiting

- **Claude Code CLI:** Provider/account dependent; routed by
  `.specify/memory/gofer-model-policy.yaml`
- **Gemini CLI:** Provider/account dependent; routed by
  `.specify/memory/gofer-model-policy.yaml`
- **OpenAI Codex CLI:** Provider/account dependent; routed by
  `.specify/memory/gofer-model-policy.yaml`
- **Cost Budget:** Default $10 per run, enforced by `CostBudgetEnforcer`

## Operational Notes

### Health Checks

- **Language Server:** Heartbeat via LSP connection
- **Extension Activation:** `onStartupFinished` event
- **Context Health:** Monitored via status bar with color indicators
  (green/yellow/orange/red)

### Logging

- **Extension Logs:** Winston logger, output channel in VS Code
- **Language Server Logs:** LSP connection console
- **Tool Audit Logs:** `.specify/logs/tool-audit.jsonl`
- **Context Usage Logs:** `.specify/logs/context-usage.jsonl`
- **Run Ledger:** `.specify/logs/gofer-run-ledger.jsonl`

### Monitoring

- **AI Usage Panel:** Real-time token usage and cost tracking
- **Progress Panel:** Spec status with Harvey ball icons (◔ ◑ ◕ ●)
- **Memory Panel:** Memory layer stats and recent observations
- **Context Health Status Bar:** Real-time context window percentage

### Error Handling

- **MCP Tool Errors:** Returned as JSON-RPC error responses
- **LSP Errors:** Logged to connection console
- **Extension Errors:** Logged to output channel, shown as notifications
- **Validation Failures:** Captured in validation report, shown in panel
