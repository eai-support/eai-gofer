# EAI Gofer Language Server

A dual-protocol server implementing both Language Server Protocol (LSP) and
Model Context Protocol (MCP) for EAI Gofer business specification-driven
development with AI coding agents.

## Overview

The EAI Gofer Language Server serves as the bridge between the VS Code
extension, workspace MCP, and AI coding agents in Codex, Claude Code, GitHub
Copilot, and compatible app surfaces. It provides:

- **LSP Communication**: Custom methods for extension-to-server communication
- **MCP Tools**: 29 tools that AI agents can invoke for specs, tasks, context
  health, workspace bootstrap, pipeline state, validation, and artifact reads
- **EAI Gofer Integration**: Loads and parses GitHub Gofer format specifications
- **Real-time Updates**: Notifies extension when task status changes

## Architecture

```
language-server/
├── src/
│   ├── server.ts                 # Main LSP + MCP server
│   ├── mcp/
│   │   └── toolHandler.ts        # MCP tool implementations
│   └── utils/
│       └── goferLoader.ts      # Spec loading and parsing
├── dist/                          # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## MCP Tools

The server exposes 29 MCP tools for AI agents:

| Category             | Tools                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs and tasks      | `gofer_get_specs`, `gofer_get_next_task`, `gofer_execute_task`, `gofer_update_task_status`                                                                    |
| Validation and tests | `gofer_validate_code`, `gofer_run_tests`, `gofer_check_slop`, `gofer_validate_branch`                                                                         |
| Context health       | `gofer_get_context_health`, `gofer_expand_observation`, `gofer_peek_observation`, `gofer_fold_observation`, `gofer_grep_observations`                         |
| Context REPL         | `gofer_context_peek`, `gofer_context_grep`, `gofer_context_fold`, `gofer_context_expand`, `gofer_context_undo`, `gofer_context_history`, `gofer_context_repl` |
| Research and handoff | `gofer_get_research_index`, `gofer_load_research_chunk`, `gofer_trigger_handoff`                                                                              |
| App/native bridge    | `gofer_check_workspace`, `gofer_bootstrap_workspace`, `gofer_get_pipeline_state`, `gofer_start_stage`, `gofer_explain_eai_error`, `gofer_open_artifact`       |

The app/native bridge tools are deliberately thin. They call or explain the
repo-owned `.specify/scripts/` and artifact files so Codex App, Claude Code,
GitHub Copilot, Gemini, and VS Code do not need separate Gofer workflow logic.

## LSP Custom Methods

The server also provides custom LSP methods for the VSCode extension:

### `gofer/getSpecs`

Returns all specifications (similar to MCP tool but via LSP)

### `gofer/executeTask`

Execute a task (called by extension UI)

### `gofer/updateTaskStatus`

Update task status and notify extension

## Setup

### Installation

```bash
cd language-server
npm install
npm run build
```

### Usage

The server is automatically launched by the VSCode extension. It can also be
started manually:

```bash
node dist/server.js --stdio
```

### Configuration

The server requires:

- Workspace root path (provided during LSP initialization)
- `.specify/` for full pipeline state; the app/native bridge can report missing
  or stale scaffolds before the repo is initialized

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing

Integration tests are located in `../tests/integration/mcpTools.test.ts`

```bash
cd ..
npm run test:integration
```

## Security

The server implements security measures:

- **Input Validation**: All spec IDs and task IDs are validated for format
- **Path Traversal Prevention**: File paths are validated to prevent `../`
  attacks
- **Length Limits**: Response sizes are limited to prevent DoS
- **Error Sanitization**: System paths are not exposed in error messages

## Performance

Performance targets:

- Server startup: <1s
- Spec loading: <500ms for 100+ specs
- Tool response time: <100ms
- Cached specs in memory for fast access

## Debugging

Enable console logging in the VSCode extension output panel:

1. Open VSCode
2. View → Output
3. Select "EAI Gofer Language Server" from dropdown
4. Watch real-time logs

## Contributing

When modifying the server:

1. Update tool schemas in `server.ts` if changing parameters
2. Update `toolHandler.ts` for implementation changes
3. Add integration tests for new tools
4. Update this README with any new capabilities

## License

See LICENSE in root directory
