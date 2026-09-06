---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - API Reference

## Executive Summary

Gofer exposes three API surfaces:

1. **Model Context Protocol (MCP) Tools** - 23+ tools for AI assistants to
   manage specs, tasks, memory, and context
2. **Language Server Protocol (LSP) Methods** - Custom LSP methods for
   extension-to-server communication
3. **VS Code Extension Commands** - 75+ commands registered in VS Code command
   palette

All APIs use JSON for request/response payloads and follow error handling
conventions with typed error codes.

## Model Context Protocol (MCP) Tools

MCP tools are exposed via the language server and callable by Claude Code,
GitHub Copilot, and other MCP-compatible AI assistants. Tools are invoked via
LSP custom request `tools/call`.

### Tool Categories

- **Spec Management** - List, read, and manage specifications
- **Task Execution** - Query and execute implementation tasks
- **Validation** - Code quality checks and test execution
- **Memory** - Store and retrieve project knowledge
- **Context Management** - Progressive context compaction and observation
  handling
- **Health & Diagnostics** - Context health, slop detection, research chunking

### Core MCP Tools

| Tool Name                   | Purpose                                     | Required Params              | Auth |
| --------------------------- | ------------------------------------------- | ---------------------------- | ---- |
| `gofer_get_specs`           | List all specs                              | None                         | No   |
| `gofer_get_next_task`       | Get next available task                     | None                         | No   |
| `gofer_execute_task`        | Execute specific task with enriched context | `specId`, `taskId`           | No   |
| `gofer_update_task_status`  | Update task status                          | `specId`, `taskId`, `status` | No   |
| `gofer_validate_code`       | Validate code quality                       | `files`                      | No   |
| `gofer_run_tests`           | Run specification tests                     | `specId`                     | No   |
| `gofer_expand_observation`  | Retrieve full masked observation            | `observationId`              | No   |
| `gofer_peek_observation`    | Get observation summary                     | `observationId`              | No   |
| `gofer_fold_observation`    | Mask observation to save context            | `observationId`              | No   |
| `gofer_grep_observations`   | Search observations                         | `pattern`                    | No   |
| `gofer_context_peek`        | View context state                          | None                         | No   |
| `gofer_context_repl`        | Interactive context management              | `command`                    | No   |
| `gofer_get_context_health`  | Get context health status                   | None                         | No   |
| `gofer_get_research_index`  | Get research chunk index                    | `specId`                     | No   |
| `gofer_load_research_chunk` | Load specific research chunk                | `specId`, `chunkId`          | No   |
| `gofer_trigger_handoff`     | Save session checkpoint                     | `specId`                     | No   |
| `gofer_check_slop`          | Detect code slop                            | `files`                      | No   |

See detailed parameter schemas in language-server/src/server.ts (line 175+).

## Language Server Protocol (LSP) Methods

Custom LSP methods for extension-to-server communication.

### `gofer/listSpecs`

List all specifications in workspace.

**Request:**

```json
{
  "method": "gofer/listSpecs",
  "params": {}
}
```

**Response:**

```json
{
  "specs": [...]
}
```

### `gofer/getSpec`

Get a specific specification by ID.

**Request:**

```json
{
  "method": "gofer/getSpec",
  "params": {
    "specId": "001-login-feature"
  }
}
```

**Response:**

```json
{
  "spec": {...}
}
```

### `gofer/updateProgress`

Update progress for a spec/task (extension → server notification).

**Notification:**

```json
{
  "method": "gofer/updateProgress",
  "params": {
    "specId": "001-login-feature",
    "taskId": "T001",
    "status": "completed"
  }
}
```

## VS Code Extension Commands

Commands registered in the VS Code command palette (`Cmd/Ctrl+Shift+P`).

### Repository Management

| Command              | Title                           | Keybinding         | Description                         |
| -------------------- | ------------------------------- | ------------------ | ----------------------------------- |
| `gofer.initialize`   | Gofer: Initialize Repository    | `Ctrl+Shift+Alt+I` | Create `.specify/` folder structure |
| `gofer.upgrade`      | Gofer: Upgrade to Gofer Format  | -                  | Migrate from legacy format          |
| `gofer.fixSpecPaths` | Gofer: Fix Spec Path References | -                  | Fix paths after migration           |

### Specification Management

| Command                 | Title                             | Keybinding | Description                   |
| ----------------------- | --------------------------------- | ---------- | ----------------------------- |
| `gofer.openSpec`        | Gofer: Open Specification         | -          | Open spec file in editor      |
| `gofer.createSpec`      | Gofer: Create New Specification   | -          | Create new spec with template |
| `gofer.showSpecDetails` | Gofer: Show Specification Details | -          | Show spec metadata            |
| `gofer.refreshSpecs`    | Gofer: Refresh Specifications     | -          | Reload specs from disk        |

### UI Panels

| Command                  | Title                          | Keybinding | Description                  |
| ------------------------ | ------------------------------ | ---------- | ---------------------------- |
| `gofer.showProgress`     | Gofer: Show Progress Panel     | -          | Show spec progress tree view |
| `gofer.showAIUsage`      | Gofer: Show AI Usage Details   | -          | Show token usage and costs   |
| `gofer.showConstitution` | Gofer: Show Constitution Panel | -          | Show project constitution    |
| `gofer.viewMemories`     | Gofer: View Memories           | -          | Show memory panel            |

### Memory Management

| Command                          | Title                                     | Keybinding | Description                            |
| -------------------------------- | ----------------------------------------- | ---------- | -------------------------------------- |
| `gofer.remember`                 | Gofer: Remember                           | -          | Store new memory                       |
| `gofer.searchMemory`             | Gofer: Search Memory                      | -          | Search memories by keyword             |
| `gofer.forgetMemory`             | Gofer: Forget Memory                      | -          | Delete specific memory                 |
| `gofer.clearMemory`              | Gofer: Clear Memory                       | -          | Clear all memories (with confirmation) |
| `gofer.queryMemoryUsage`         | Gofer: Query Memory Usage                 | -          | Show memory stats                      |
| `gofer.migrateMemoriesToLayered` | Gofer: Migrate Memories to Layered Format | -          | Migrate to 3-layer memory system       |
| `gofer.viewCompactionHistory`    | Gofer: View Compaction History            | -          | Show memory compaction log             |

### Context Management

| Command                            | Title                                | Keybinding | Description                    |
| ---------------------------------- | ------------------------------------ | ---------- | ------------------------------ |
| `gofer.refreshContextWindow`       | Gofer: Refresh Context Window        | -          | Refresh context health status  |
| `gofer.showContextCategoryContent` | Gofer: Show Context Category Content | -          | Show specific context category |

### Updates & Maintenance

| Command                 | Title                    | Keybinding | Description                 |
| ----------------------- | ------------------------ | ---------- | --------------------------- |
| `gofer.checkForUpdates` | Gofer: Check for Updates | -          | Check for extension updates |
| `gofer.updateNow`       | Gofer: Update Now        | -          | Download and install update |
| `gofer.updateTemplates` | Gofer: Update Templates  | -          | Download latest templates   |

### Developer Tools

| Command                      | Title                                   | Keybinding | Description                                      |
| ---------------------------- | --------------------------------------- | ---------- | ------------------------------------------------ |
| `gofer.installOptionalTools` | Gofer: Install Optional Developer Tools | -          | Install node-pty and other optional dependencies |
| `gofer.createHintFile`       | Gofer: Create Hint File                 | -          | Create implementation hint file                  |

## Error Handling

### Error Response Format

All MCP tools return errors in the following format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "errorCode": "ERROR_CODE"
}
```

### Common Error Codes

| Code                    | Description                     | Recovery                                  |
| ----------------------- | ------------------------------- | ----------------------------------------- |
| `SPEC_NOT_FOUND`        | Specification not found         | Verify specId exists in `.specify/specs/` |
| `TASK_NOT_FOUND`        | Task not found in specification | Verify taskId exists in `tasks.md`        |
| `LOAD_ERROR`            | Failed to load file from disk   | Check file permissions and disk space     |
| `VALIDATION_ERROR`      | Input validation failed         | Check parameter types and required fields |
| `SEARCH_ERROR`          | Search operation failed         | Simplify search query                     |
| `MEMORY_LOAD_ERROR`     | Failed to load memory store     | Check `.specify/memory/` permissions      |
| `OBSERVATION_NOT_FOUND` | Observation ID not found        | Verify observation UUID is valid          |
| `NO_TASKS_AVAILABLE`    | No tasks ready for execution    | Check task dependencies and status        |

### Rate Limiting

- **MCP Tools:** No rate limiting (local execution)
- **Provider CLIs:** Subject to provider and account limits:
  - Claude Code CLI: model route comes from
    `.specify/memory/gofer-model-policy.yaml`
  - Antigravity CLI: model route comes from
    `.specify/memory/gofer-model-policy.yaml`
  - OpenAI Codex CLI: model route comes from
    `.specify/memory/gofer-model-policy.yaml`

### Authentication

- **MCP Tools:** No authentication required (local workspace only)
- **AI Providers:** Use each provider CLI's login/session state. Environment
  variables such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` are optional CLI
  fallback mechanisms only, not Gofer VS Code settings.

## Versioning

- **Current Version:** 3.4.0
- **API Stability:** Experimental (MCP tools may change between minor versions)
- **Breaking Changes:** Announced in CHANGELOG.md with migration guide
- **Deprecation Policy:** 2 minor versions notice before removal

## Usage Examples

### Claude Code: Execute a Task

```
#gofer_execute_task specId="001-login-feature" taskId="T003"
```

### GitHub Copilot: Query Specs

```
#gofer_get_specs
```

### VS Code Extension: Refresh Progress

```typescript
vscode.commands.executeCommand('gofer.refreshSpecs');
```

### LSP Client: Update Task Status

```typescript
await lspClient.sendRequest('gofer/updateProgress', {
  specId: '001-login-feature',
  taskId: 'T001',
  status: 'completed',
});
```
