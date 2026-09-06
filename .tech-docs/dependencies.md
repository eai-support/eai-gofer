---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - Dependencies

## Executive Summary

Gofer has three dependency categories:

1. **Production Dependencies** (npm packages) - 8 core packages
2. **Development Dependencies** - packages for build, test, lint, and release
3. **External Service Dependencies** - optional AI assistant CLIs and hosted
   services

All dependencies are managed via npm with lock files for reproducible builds.
External services are optional and user-configured.

## Upstream Dependencies (Services This Repo Calls)

### External Services (Optional)

| Service              | Purpose                                         | Authentication             | Rate Limit                    | Criticality |
| -------------------- | ----------------------------------------------- | -------------------------- | ----------------------------- | ----------- |
| **Claude Code CLI**  | Claude routes from the Gofer model policy       | Provider CLI login/session | Provider/account dependent    | Optional    |
| **Antigravity CLI**  | Gemini routes from the Gofer model policy       | Provider CLI login/session | Provider/account dependent    | Optional    |
| **OpenAI Codex CLI** | Codex/OpenAI routes from the Gofer model policy | Provider CLI login/session | Provider/account dependent    | Optional    |
| **GitHub API**       | Auto-update checking                            | No auth (public API)       | 60 req/hour (unauthenticated) | Optional    |

### VS Code Platform

| Service                              | Purpose                              | Version               | Criticality |
| ------------------------------------ | ------------------------------------ | --------------------- | ----------- |
| **VS Code Extension API**            | Extension host, commands, views, LSP | 1.93.0+               | Required    |
| **VS Code Language Server Protocol** | Communication with language server   | 9.0.1                 | Required    |
| **VS Code MCP Bridge**               | MCP tool exposure to AI assistants   | 1.102+ (experimental) | Core        |

## Downstream Dependents (Services That Call This Repo)

### AI Assistant CLIs

| Assistant               | Integration Method                | Tool Access                   | Status  |
| ----------------------- | --------------------------------- | ----------------------------- | ------- |
| **Claude Code CLI**     | MCP via LSP                       | 22+ tools (direct invocation) | Primary |
| **GitHub Copilot Chat** | Prompt files (`.github/prompts/`) | Indirect (files only)         | Core    |
| **OpenAI Codex CLI**    | Skill files (`.agents/skills/`)   | Indirect (files only)         | Core    |
| **Antigravity CLI**     | Command files (`.agents/skills/`) | Indirect (files only)         | Core    |

### VS Code Extension Consumers

| Consumer              | Integration         | Purpose                       |
| --------------------- | ------------------- | ----------------------------- |
| **VS Code User**      | Direct installation | Primary user interface        |
| **GitHub Codespaces** | Auto-installation   | Cloud development environment |

## Production npm Dependencies

### Core Runtime Dependencies

| Package            | Version | Purpose                               | License      |
| ------------------ | ------- | ------------------------------------- | ------------ |
| `chokidar`         | 4.0.3   | File system watching for spec changes | MIT          |
| `dotenv`           | 16.6.1  | Environment variable loading          | BSD-2-Clause |
| `gray-matter`      | 4.0.3   | YAML frontmatter parsing for specs    | MIT          |
| `reflect-metadata` | 0.2.2   | TypeScript decorator metadata         | Apache-2.0   |
| `tsyringe`         | 4.10.0  | Dependency injection container        | MIT          |
| `winston`          | 3.19.0  | Logging framework                     | MIT          |
| `ws`               | 8.21.0  | WebSocket support                     | MIT          |
| `zod`              | 3.25.76 | Schema validation for MCP tools       | MIT          |

**Total Production Dependencies:** 8 packages

### Extension-Specific Dependencies

Additional dependencies in `extension/package.json`:

| Package                       | Version      | Purpose                          | License    |
| ----------------------------- | ------------ | -------------------------------- | ---------- |
| `@lydell/node-pty`            | 1.2.0-beta.3 | Pseudo-terminal integration      | MIT        |
| `ajv`                         | 8.18.0       | JSON schema validation           | MIT        |
| `body-parser`                 | 2.2.2        | Local HTTP request parsing       | MIT        |
| `chokidar`                    | 3.6.0        | Extension-side file watching     | MIT        |
| `express`                     | 5.2.1        | Local service endpoints          | MIT        |
| `fast-glob`                   | 3.3.3        | Resource discovery               | MIT        |
| `fix-path`                    | 4.0.0        | macOS PATH normalization         | MIT        |
| `graphlib`                    | 2.1.8        | Task dependency graph resolution | MIT        |
| `jszip`                       | 3.10.1       | ZIP/resource packaging           | MIT/GPL    |
| `node-pty-prebuilt-multiarch` | 0.10.1-pre.5 | Terminal fallback support        | MIT        |
| `reflect-metadata`            | 0.2.2        | TypeScript decorator metadata    | Apache-2.0 |
| `tsyringe`                    | 4.10.0       | Dependency injection container   | MIT        |
| `uuid`                        | 11.1.1       | Observation ID generation        | MIT        |
| `vscode-languageclient`       | 9.0.1        | Language server client           | MIT        |
| `ws`                          | 8.21.0       | WebSocket support                | MIT        |

## Development Dependencies

### Build & Compilation

| Package       | Version  | Purpose                          |
| ------------- | -------- | -------------------------------- |
| `typescript`  | 5.9.3    | TypeScript compiler              |
| `tsx`         | 4.21.0   | TypeScript execution for scripts |
| `@types/node` | 22.19.15 | Node.js type definitions         |

### Testing

| Package                 | Version | Purpose                          |
| ----------------------- | ------- | -------------------------------- |
| `vitest`                | 3.2.4   | Test runner (unit & integration) |
| `@vitest/ui`            | 3.2.4   | Vitest UI for test visualization |
| `@vitest/coverage-v8`   | 3.2.4   | Coverage reporting               |
| `@playwright/test`      | 1.58.2  | E2E testing framework            |
| `@vscode/test-cli`      | 0.0.12  | VS Code extension testing CLI    |
| `@vscode/test-electron` | 2.5.2   | VS Code extension test runner    |

### Linting & Formatting

| Package                            | Version | Purpose                      |
| ---------------------------------- | ------- | ---------------------------- |
| `eslint`                           | 9.39.4  | JavaScript/TypeScript linter |
| `@eslint/js`                       | 9.39.4  | ESLint JavaScript rules      |
| `typescript-eslint`                | 8.56.1  | TypeScript ESLint plugin     |
| `@typescript-eslint/parser`        | 8.56.1  | TypeScript parser for ESLint |
| `@typescript-eslint/eslint-plugin` | 8.56.1  | TypeScript ESLint rules      |
| `prettier`                         | 3.8.1   | Code formatter               |
| `lint-staged`                      | 16.3.2  | Run linters on staged files  |
| `husky`                            | 9.1.7   | Git hooks                    |

### Optional Development APIs

Gofer no longer keeps direct provider SDKs as development dependencies. Tests
that exercise provider behavior use CLI-provider seams and local fixtures.

Development dependency counts are tracked by the npm manifests and lock files.

## Dependency Diagram

```mermaid
graph LR
    subgraph "Gofer Extension"
        Ext["Extension<br/>(extension/)"]
        LS["Language Server<br/>(language-server/)"]
        Orch["Orchestrator<br/>(src/)"]
    end

    subgraph "AI Assistants"
        Claude["Claude Code CLI"]
        Copilot["GitHub Copilot"]
        Codex["OpenAI Codex"]
        Gemini["Antigravity CLI"]
    end

    subgraph "External Services"
        ClaudeCLI["Claude Code CLI"]
        GeminiCLI["Antigravity CLI"]
        CodexCLI["OpenAI Codex CLI"]
        GitHubAPI["GitHub API"]
    end

    subgraph "VS Code Platform"
        VSCodeAPI["VS Code Extension API"]
        LSPAPI["Language Server Protocol"]
    end

    subgraph "npm Packages"
        tsyringe["tsyringe<br/>(DI)"]
        winston["winston<br/>(logging)"]
        zod["zod<br/>(validation)"]
        chokidar["chokidar<br/>(file watch)"]
        graphlib["graphlib<br/>(task graph)"]
    end

    Ext --> VSCodeAPI
    Ext --> LSPAPI
    Ext --> tsyringe
    Ext --> winston
    Ext --> graphlib

    LS --> LSPAPI
    LS --> zod
    LS --> chokidar

    Claude -->|MCP Tools| LS
    Copilot -->|Prompt Files| Ext
    Codex -->|Skill Files| Ext
    Gemini -->|Command Files| Ext

    Ext -.->|Optional| GitHubAPI
    Claude -.->|Provider account| ClaudeCLI
    Codex -.->|Provider account| CodexCLI
    Gemini -.->|Provider account| GeminiCLI
```

## Dependency Update Strategy

### Automated Updates

- **Renovate Bot:** Configured for automated dependency PRs
- **Frequency:** Weekly scans
- **Auto-Merge:** Patch updates only (after CI passes)
- **Major Updates:** Manual review required

### Security Updates

- **npm audit:** Run during CI pipeline
- **GitHub Dependabot:** Security alerts enabled
- **Response Time:** < 48 hours for critical vulnerabilities

### Version Constraints

- **Production:** Pin to specific versions (`zod@3.25.76`)
- **Development:** Allow minor updates (`vitest@^3.2.4`)
- **VS Code API:** Minimum version (`^1.93.0`)

## Dependency Overrides

Security and compatibility overrides in `package.json`:

```json
{
  "overrides": {
    "diff": "^8.0.3", // Security fix for CVE
    "postcss": "^8.5.10", // Security fix
    "serialize-javascript": "^7.0.0" // Security fix
  }
}
```

## Critical Dependency Risks

### AI Assistant CLIs

- **Risk:** CLI output, auth flows, or model availability can change
- **Mitigation:** Keep provider routing behind CLI adapters and validate through
  integration tests
- **Fallback:** Surface clear install/login guidance and let users choose a
  different configured CLI

### VS Code Extension API

- **Risk:** Minimum version compatibility
- **Mitigation:** Test against VS Code 1.93.0+ in CI
- **Fallback:** Document minimum required version

### tsyringe (Dependency Injection)

- **Risk:** Core service lifecycle management
- **Mitigation:** Extensive unit tests, DI abstraction layer
- **Fallback:** Manual service initialization (deprecated)

### chokidar (File Watching)

- **Risk:** File system event reliability
- **Mitigation:** Debounce events, cache with TTL
- **Fallback:** Manual refresh commands

## License Compliance

All production and development dependencies use permissive licenses:

- **MIT:** 90% of dependencies
- **Apache-2.0:** `reflect-metadata`
- **BSD-2-Clause:** `dotenv`

No copyleft licenses (GPL, AGPL) are used.

## Dependency Size Analysis

### Production Bundle Size

- **Extension:** ~10MB (VSIX package)
- **Agent Plugin:** ~500KB (ZIP)
- **Language Server:** ~2MB (bundled in extension)

### node_modules Size

- **Production:** ~50MB
- **Development:** ~300MB

## Removal & Deprecation

### Recently Removed

- `node-pty-prebuilt-multiarch` (v3.0) - Removed due to native dependency
  issues, replaced with WebSocket terminal

### Deprecated

- `.specify/memory/memories.jsonl` (flat memory) - Replaced by layered memory
  system (opt-in migration)

### Planned Removal

- `src/orchestrator/` (CLI-based orchestrator) - Replaced by extension-based
  ACCOrchestrator

## Installation Requirements

### Minimum Node.js Version

- **Node.js:** 24.x (LTS)
- **npm:** 9.x or 10.x

### VS Code Version

- **Minimum:** 1.93.0
- **Recommended:** Latest stable

### Operating System

- **Windows:** 10/11 (x64, arm64)
- **macOS:** 11+ (x64, arm64)
- **Linux:** Ubuntu 20.04+, Debian 11+, RHEL 8+

## Troubleshooting

### Issue: npm install fails

- **Cause:** Node.js version mismatch or npm cache corruption
- **Fix:**
  ```bash
  rm -rf node_modules package-lock.json
  nvm use 24
  npm install
  ```

### Issue: Extension fails to activate

- **Cause:** Missing reflect-metadata import
- **Fix:** Ensure `import 'reflect-metadata';` is first import in `extension.ts`

### Issue: MCP tools not working

- **Cause:** Language server not starting or Zod validation failure
- **Fix:** Check VS Code Output → "Gofer" for errors, verify params match schema
