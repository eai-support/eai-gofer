---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Gofer Technical Overview

## Executive Summary

| Attribute | Value |
| --- | --- |
| Service name | Gofer (`eai-gofer`) |
| Primary capability | Spec-driven delivery workflow for VS Code and AI coding CLIs |
| Primary users or consumers | Developers and AI assistants using VS Code, Claude Code, Codex, GitHub Copilot, Google Antigravity, or Grok Build |
| Data sensitivity | Local workspace artifacts; specifications and logs can contain source context. Provider credentials are external and are not managed by Gofer. |
| Current status | Active development; repository and extension version `3.12.9` |
| Last material change | 2026-09-20: Claude Code execution adapter using a shared native launcher (`a472e0f`, commit subject). |

Gofer turns one user-facing `eai` request into a repository-owned pipeline:
start, research, specify, plan, tasks, implement, and validate. It is not a
hosted service or database-backed API. The primary runtime is a VS Code
extension; a Node orchestrator, a headless contract library, and an LSP/MCP
language server provide CLI and automation surfaces.

## Service Identity

- **Owner:** EAI Tools; repository:
  [eai-support/eai-gofer](https://github.com/eai-support/eai-gofer)
- **License:** Apache-2.0
- **Runtime requirement:** Node.js `>=24.0.0`; VS Code `^1.93.0` for the extension.
- **Primary workspace boundary:** the repository containing `.specify/`.

## Tech Stack

| Area | Technology | Evidence |
| --- | --- | --- |
| Language | TypeScript, ESM | Root `package.json` |
| Runtime | Node.js 24.x | Root and component manifests |
| Desktop host | VS Code Extension API | `extension/package.json` |
| Protocols | LSP and MCP over stdio | `language-server/src/server.ts`, `mcpServer.ts` |
| Validation | Zod, AJV MCP schema validation, custom headless contracts | `src/headless/`, `language-server/src/mcpServer.ts` |
| Persistence | Markdown, JSON, JSONL files under `.specify/` | `.specify/` scaffold and runtime loaders |
| Testing | Vitest, Playwright, VS Code Test CLI | Root and extension scripts |
| Documentation site | Docusaurus 3.10.1 | `docs-site/package.json` |

## Entry Points and Local Run

```bash
npm ci
npm --prefix extension ci
npm --prefix language-server ci
npm run build:all
npm test
```

Useful entry points:

| Entry point | Role |
| --- | --- |
| `src/index.ts` | Starts the autonomous Node orchestrator; honors `SPEC_DIR` and `WORKSPACE_DIR`. |
| `language-server/src/server.ts` | VS Code language server with LSP custom methods and legacy MCP exposure. |
| `language-server/src/mcpServer.ts` | Standalone stdio MCP server; requires `--workspace-root`. |
| `extension/src/extension.ts` | VS Code activation, dependency injection, commands, UI, and language-server client. |
| `.specify/commands/*.md` | Canonical internal stage contracts used to generate host-specific command surfaces. |

## Critical Integrations

| Integration | Direction | Purpose | Criticality |
| --- | --- | --- | --- |
| VS Code Extension API | Gofer ↔ platform | Commands, views, settings, activation, and language-server hosting | Required for desktop UX |
| Claude Code CLI | Gofer → provider/host | Autonomous execution and command surface | Optional, primary autonomous route |
| OpenAI Codex CLI | Gofer → provider/host | Alternative autonomous route and generated skills | Optional |
| GitHub Copilot | Host → Gofer | Prompt/skill command surface and MCP compatibility | Supported consumer |
| Google Antigravity and Grok Build | Host → Gofer | Generated skill/plugin surfaces | Supported consumers |
| GitHub Actions and Pages | Repository → distribution | CI, release packaging, and Docusaurus publication | Required for releases/docs |

## Documentation Surfaces

| Path | Purpose | Publishing workflow | Central tech-docs coverage |
| --- | --- | --- | --- |
| `.tech-docs/` | Canonical generated technical documentation | Consumed by `docs-site` and deployed by `pages.yml` | Yes; this is the canonical surface |
| `docs-site/` | Docusaurus site wrapper and release/download pages | `pages.yml` builds and deploys `docs-site/build` to GitHub Pages | Yes |
| `docs/` | Repo-local operational and historical engineering notes | No separate publisher discovered; retained as source material | Summarized here where relevant |
| `README.md`, `AGENTS.md`, `CLAUDE.md` | User, agent, and workflow guidance | Manually maintained in GitHub | Summarized here; not generated |
| `.tech-docs/legacy-src/` | Archived retired documentation source | Excluded from Docusaurus by config | Preserved, not primary |

The `_tech-docs-prompts/` directory is intentionally excluded from this
inventory and documentation.

## Current Status

- Nightly-managed `.tech-docs/` content is present for this repository.
- Source commit: `a472e0f9103c`
- Additional repo-local docs surfaces detected: 2
