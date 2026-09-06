---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - Technical Overview

## Executive Summary

| Attribute                | Value                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Service Name**         | Gofer                                                                                                      |
| **Primary Capability**   | One-command EAI delivery pipeline with UI-first app delivery and multi-platform AI assistant support       |
| **Primary Users**        | Business and delivery teams using Claude Code, GitHub Copilot, OpenAI Codex, Antigravity CLI, or VS Code   |
| **Data Sensitivity**     | Low - stores specifications, plans, and code artifacts locally in repository workspace                     |
| **Current Status**       | Active Development (v3.7.24) - production-ready with public plugin and VSIX distribution                   |
| **Last Material Change** | 2026-07-17 - one-command `/eai` user experience, public release refresh, and Admin Portal contract support |

## Service Identity

- **Name:** Gofer
- **Version:** 3.7.24
- **Documentation Updated:** 2026-07-17
- **Publisher:** EAI Tools
- **Repository:**
  [eai-support/eai-gofer](https://github.com/eai-support/eai-gofer)

**Description:** Spec-driven delivery system for AI assistants. Users start with
`/eai`, `#eai`, or `$eai` depending on the host. Gofer then checks readiness,
routes the internal pipeline, keeps stakeholder artifacts current, shows UI
progress early, and validates the result.

## Purpose

Gofer is a VS Code extension and portable agent plugin that bridges business
intent with AI implementation through repo-owned pipeline artifacts, lightweight
host entrypoints, and a dual-protocol architecture (LSP + MCP). It provides:

1. **Model Context Protocol (MCP) Tools** - 23+ tools that AI assistants call
   directly to read specs, execute tasks, validate code, and manage context
2. **Specification Framework** - Structured `.specify/` directory format for
   feature specs, plans, and tasks
3. **Multi-Platform CLI Support** - One public `eai` entrypoint for Claude Code,
   GitHub Copilot Chat, OpenAI Codex, and Antigravity CLI, backed by internal
   stage contracts
4. **Autonomous Execution** - Optional orchestrator that drives Claude Code
   through full implementation cycles with Haiku-based decision making
5. **Adaptive Context Compaction (ACC)** - 5-stage progressive context
   management (70%, 80%, 85%, 90%, 99% thresholds)
6. **Constitution-Based Validation** - Enforces project principles and coding
   standards through ScopeGuard
7. **Visual Artifacts** - 10 persona-pack templates (Impact Canvas, C4, ERD,
   Risk Heatmap) with 7 specialized visual writer agents
8. **Cost Budget Enforcement** - Tracks token usage and enforces cost limits per
   pipeline run ($10 default)
9. **Scope Guard** - Prevents AI from accessing protected files defined in specs
   (advisory/warning/blocking modes)
10. **Memory Management** - MemGPT-inspired three-layer memory system with
    automatic compaction and TF-IDF retrieval

## Tech Stack

| Component            | Technology            | Version        |
| -------------------- | --------------------- | -------------- |
| Language             | TypeScript            | 5.9.3          |
| Runtime              | Node.js               | 24.x           |
| Framework            | VSCode Extension API  | 1.93.0+        |
| Build Tool           | Webpack               | 5.x            |
| Testing              | Vitest + Playwright   | 3.2.4 / 1.58.2 |
| AI SDK               | Anthropic SDK         | 0.67.1         |
| Language Server      | vscode-languageserver | 9.0.1          |
| Dependency Injection | tsyringe              | 4.10.0         |
| Schema Validation    | Zod                   | 3.25.76        |
| File Watching        | chokidar              | 4.0.3          |
| Logging              | winston               | 3.19.0         |

## Key Entry Points

### Extension Entry Point

**File:** `extension/src/extension.ts`

- Activates on startup (`onStartupFinished`)
- Line 100: `activate()` initializes DI container via tsyringe
- Line 49: `registerServices()` registers all injectable services
- Registers 75+ commands, 3 views, 2 status bars
- Initializes LSP client for communication with language server
- Sets up autonomous orchestration (ACCOrchestrator), memory management, and
  context health monitoring
- **Extension file count:** 247+ TypeScript files (across all modules)

### Language Server Entry Point

**File:** `language-server/src/server.ts`

- Dual-protocol server (LSP + MCP)
- Line 129+: `connection.onInitialize()` registers 23 MCP tools
- Line 719+: `connection.onRequest('tools/call')` handles MCP tool invocations
- Implements custom LSP methods for spec/task management
- Exposes tools to Claude Code, GitHub Copilot via VSCode MCP bridge
- **Server file count:** 10+ TypeScript files

### Orchestrator Entry Point

**File:** `src/orchestrator/AutonomousOrchestrator_new.ts`

- Optional autonomous execution mode (CLI-based)
- Coordinates Claude Code terminal sessions
- Manages task queue and dependencies
- IPC status signaling via `.specify/ipc/status.json`
- **Note:** Extension-based ACC orchestration preferred (see
  `extension/src/autonomous/ACCOrchestrator.ts`)

## How to Run Locally

### 1. Install Dependencies

```bash
npm install
cd extension && npm install
cd ../language-server && npm install
```

### 2. Build All Components

```bash
npm run build:all
```

### 3. Run Extension in Development Mode

```bash
# Open in VSCode
code .

# Press F5 to launch Extension Development Host
# Or: Run > Start Debugging
```

### 4. Run Tests

```bash
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e            # End-to-end tests (VSCode Test CLI)
npm run test:e2e:playwright # Playwright browser tests
npm run test:coverage       # Coverage report
```

### 5. Build VSIX Package

```bash
cd extension
npm run package
npx vsce package
```

### 6. Generate Commands and Package Plugin

```bash
npm run gofer:generate                              # Generate CLI command surfaces
npm run gofer:package-plugin -- --version 3.4.0     # Package agent plugin zip
npm run gofer:mermaid-export                        # Export Mermaid diagrams (optional)
npm run gofer:codex-doctor                          # Diagnostic tool
```

## Team/Ownership

**Owner:** EAI Tools  
**Primary Contact:**
[eai-support/eai-gofer](https://github.com/eai-support/eai-gofer)

**Key Maintainer Information:**

- Based on CLAUDE.md, the project follows a structured workflow with autonomous
  bug fixing and self-improvement loops
- Uses Gofer's own pipeline for development through `/eai`, which routes
  internally through start → research → specify → plan → tasks → implement →
  validate
- Specifications stored in `.specify/specs/` directory
- Constitution principles defined in `.specify/memory/constitution.md`

**Recent Specifications (2026-05):**

- **032-gofer-ui-first-builder** - UI-first app delivery workflow (Completed,
  v3.2.2)
- **031-skills-pipeline-augmentation** - Enhanced agent coordination (Completed,
  v3.2.0)
- **027-public-builder-runtime** - Public builder/runtime boundary clarification
  (Completed, v3.3.1)

## Project Structure

```
gofer/
├── extension/           # VSCode extension (UI, commands, views)
│   ├── src/             # TypeScript source (247+ files)
│   │   ├── autonomous/  # ACC, context management, scope guard
│   │   ├── council/     # CLI provider routing and command generation
│   │   ├── services/    # DI services, config, state
│   │   └── ui/          # Tree view providers
│   ├── language-server/ # Bundled LSP server (copied during build)
│   └── package.json     # Extension manifest (41 commands, 13 settings)
├── language-server/     # LSP + MCP server (source)
│   ├── src/             # Server implementation
│   │   ├── mcp/         # MCP tool handler (29 tools)
│   │   └── utils/       # Gofer loader, spec cache
│   └── package.json
├── src/                 # Orchestrator (autonomous execution)
│   ├── orchestrator/    # Main orchestration loop
│   └── types/           # Shared type definitions
├── .specify/            # Specifications and memory
│   ├── commands/        # Canonical command definitions (24+ files)
│   ├── specs/           # Feature specifications
│   ├── memory/          # Constitution, enriched context, observations
│   ├── logs/            # JSONL logs (usage, audit, slop, ledger)
│   ├── templates/       # Document templates
│   └── scripts/         # Automation (bash, node, hooks)
├── docs/                # Legacy documentation (archived)
├── docs-site/           # Docusaurus-based public site
├── tests/               # Test suites (unit, integration, e2e)
└── scripts/             # Build and automation scripts
```

## Quick Start for Users

1. **Install Extension**

   ```bash
   # From GitHub Releases
   gh release download --repo eai-support/eai-gofer --pattern "*.vsix"
   code --install-extension gofer-*.vsix
   ```

   Or install from the VS Code Marketplace if the current Gofer listing is
   available in your environment.

2. **Initialize Repository**
   - Open Command Palette: `Cmd/Ctrl+Shift+P`
   - Run: `Gofer: Initialize Repository` (or `Ctrl+Shift+Alt+I`)
   - Creates `.specify/` folder structure

3. **Configure AI CLI access**
   - Run the provider login command for your chosen tool, such as `claude login`
     or `codex login`
   - Optionally set `gofer.defaultCLI`, `gofer.claudeCodeCommand`, or
     `gofer.codexCommand` in VS Code settings

4. **Create Specification**
   - Create `.specify/specs/my-feature/spec.md`
   - Add requirements and success criteria
   - Define protected boundaries if needed

5. **Let Gofer Design, Build, And Validate**
   - In Claude Code: `/eai Add user authentication`
   - In GitHub Copilot: `#eai Add user authentication`
   - In OpenAI Codex: `$eai Add user authentication`
   - In Antigravity CLI: `/eai Add user authentication`
   - Gofer checks the repo and EAI readiness, then routes the internal pipeline
     without asking the user to run numbered stage commands

## Key Features

### Multi-Platform Support (v3.0+)

- **Claude Code** - Full feature support with 29 MCP tools
- **GitHub Copilot Chat** - Core features + 2026+ enhancements
- **OpenAI Codex CLI** - Full feature support via skill system
- **Antigravity CLI** - Command files with namespace support
- **Auto-detection** - `gofer.defaultCLI` setting (`auto`, `claude`, `copilot`,
  `codex`, `antigravity`)

### CLI Innovations (v3.0+)

- **Source-of-Truth Generator** - Single canonical
  `.specify/commands/<stage>.md` emits to 4 CLI surfaces
- **Visual Artifacts** - 10 persona-pack templates (Impact Canvas, C4, ERD,
  Heatmaps)
- **7 Visual Writer Agents** - Specialized agents for each diagram type
- **Single Public Entrypoint** - `/eai`, `#eai`, or `$eai` depending on host
- **Mermaid Export** - `npm run gofer:mermaid-export` (optional)
- **Internal Pipeline Contracts** - numbered stages, helpers, and control
  commands remain available under `.specify/commands/` for Gofer to route
  internally

### Adaptive Context Compaction (ACC) v3.2+

5-stage progressive context management:

1. **70% utilization** - Delegation advisory
2. **80%** - Observation masking (5-turn threshold)
3. **85%** - Fast pruning (budget cap in truncate mode)
4. **90%** - Aggressive masking (force all observations masked)
5. **99%** - Full compaction

### Core Features

- **Branch-Aware Specs** - Detects Git branch and shows relevant specs
- **Auto-Updates** - Checks for extension updates automatically
- **Progress Tracking** - Real-time status in Gofer sidebar with Harvey ball
  icons (◔ ◑ ◕ ●)
- **Task Dependencies** - Executes tasks in dependency order via graphlib
- **Context Health** - Monitors AI context window usage (status bar with
  color-coded indicators)
- **Memory Management** - TF-IDF keyword retrieval, continuous compaction,
  JSONL-based storage
- **Scope Guard** - Prevents AI from accessing protected files
  (advisory/warning/blocking modes)
- **Cost Budget** - Tracks and enforces per-run cost limits ($10 default,
  configurable)
- **GitHub Codespaces** - Automatic installation in Codespaces
- **Auto-Context-Continuity (ACC)** - Automatic session save/resume at 65%
  context threshold
- **Slop Reduction** - Auto-removes console.log, debugger, @ts-ignore on save
  (opt-in)
- **Tool Audit Logging** - All file access logged to
  `.specify/logs/tool-audit.jsonl`
- **Research Chunking** - On-demand loading with memory-first strategy (30%
  coverage threshold)

### Recent Additions (v3.0-3.4)

- **Memory Panel Filter** - Toggle to hide system-generated memories
- **Cross-Platform Command Parity** - one public `eai` entrypoint across Claude,
  Copilot, Codex, and Antigravity, with internal stage parity retained
- **Parallel Validation** - 6 validation agents run concurrently
- **Codex Budget Doctor** - `npm run gofer:codex-doctor` diagnostic tool
- **Plugin Manifests** - `.claude-plugin/`, `.codex-plugin/`,
  `plugins/antigravity/eai-gofer/plugin.json` support
- **AI Usage Panel** - Real-time token usage and cost tracking via provider
  billing APIs
- **Resource Diagnostics** - Lightweight performance snapshots (5min intervals,
  opt-in)
- **Context REPL** - MCP tools for progressive context management
  (peek/grep/fold/expand/undo)
- **Skills Pipeline Augmentation** - Enhanced agent coordination (v3.2)
- **UI-First App Delivery** - Preview-approval-service-fit workflow for vertical
  apps (v3.2.2)
- **EAI Block Catalog Requirement** - UI generation enforced via block catalog
  (v3.3.1)
- **Agent Plugin Packaging** - Automated marketplace distribution for Claude
  Code, Codex, Copilot CLI (v3.4.0)

## Data Storage

All data is stored in the `.specify/` directory:

- **Specs:** `.specify/specs/{spec-id}/spec.md` (Markdown with YAML frontmatter)
- **Tasks:** `.specify/specs/{spec-id}/tasks.md` (Markdown checklist format)
- **Memory:** `.specify/memory/memories.jsonl` (Append-only JSONL) - DEPRECATED
- **Memory (Layered):** `.specify/memory/{core,recall,archival}/*.jsonl`
  (MemGPT-inspired, opt-in)
- **Enriched Context:** `.specify/memory/enriched-context.json` (60s freshness,
  task context)
- **Context Health:** `.specify/memory/context-health-state.json` (30s TTL)
- **Observation Cache:** `.specify/memory/observation-cache/index.json`
  (UUID-indexed observations)
- **Knowledge Graph:** `.specify/memory/knowledge-graph.json` (Entity
  relationships)
- **Logs:** `.specify/logs/` (context-usage.jsonl, tool-audit.jsonl,
  slop-reduction.jsonl, gofer-run-ledger.jsonl)
- **State:** `.specify/current-stage.json`, `.specify/ipc/status.json`

No database required - all data is file-based for Git-friendly version control.

## Critical Integrations

### Primary Integrations

| System                    | Type       | Purpose                                                      | Criticality |
| ------------------------- | ---------- | ------------------------------------------------------------ | ----------- |
| **VS Code Extension API** | Platform   | Extension host, commands, views, language server protocol    | Required    |
| **Claude Code CLI**       | Upstream   | Claude routes from `.specify/memory/gofer-model-policy.yaml` | Optional    |
| **Antigravity CLI**       | Upstream   | Gemini routes from the Gofer model policy                    | Optional    |
| **OpenAI Codex CLI**      | Upstream   | Codex/OpenAI routes from the Gofer model policy              | Optional    |
| **Claude Code CLI**       | Downstream | Primary consumer of MCP tools (23 tools)                     | Primary     |
| **GitHub Copilot**        | Downstream | Consumer of prompt files (`.github/prompts/`)                | Core        |
| **OpenAI Codex CLI**      | Downstream | Consumer of skill files (`.agents/skills/`)                  | Core        |
| **Antigravity CLI**       | Downstream | Consumer of command files (`.agents/skills/`)                | Core        |

### Secondary Integrations

- **GitHub API** - Optional auto-update checking
- **GitHub Pages** - Documentation hosting for Docusaurus site

See [./dependencies.md](./dependencies.md) for the full upstream and downstream
dependency map.

## Documentation Surfaces

This repository maintains multiple documentation surfaces:

| Path          | Purpose                                           | Publishing Workflow                                                  | Nightly Pipeline       |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| `.tech-docs/` | Canonical technical snapshot (this documentation) | Auto-generated, triggers Pages deployment                            | Yes                    |
| `docs-site/`  | Docusaurus-based public documentation site        | Built and deployed to GitHub Pages via `.github/workflows/pages.yml` | Consumes `.tech-docs/` |
| `README.md`   | Quick start and repository overview               | Manually maintained                                                  | No                     |
| `AGENTS.md`   | Agent conventions and guidelines                  | Manually maintained                                                  | No                     |
| `CLAUDE.md`   | Project-specific instructions for Claude          | Manually maintained                                                  | No                     |

**Key Notes:**

- `.tech-docs/` is the source of truth for technical documentation
- `docs-site/` publishes `.tech-docs/` content to GitHub Pages
- Changes to `.tech-docs/` automatically trigger a documentation site rebuild
- Documentation site requires Node 24+ and uses Docusaurus 3.6.3
- Legacy documentation from `docs/` archived in `.tech-docs/legacy-src/docs/`

## Current Status

- Active development at v3.7.24
- Nightly-managed `.tech-docs/` content is present for this repository
- Source commit: `0344d6df21fba9738d8bd9f6c26d7602c4e0775e`
- Additional repo-local docs surfaces detected: 1 (docs-site/)
- Recent focus: one-command `/eai` UX, public release alignment, Admin Portal
  headless contracts, and cross-platform host parity
