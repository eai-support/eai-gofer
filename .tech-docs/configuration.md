---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - Configuration

## Executive Summary

Gofer configuration is managed through VS Code settings (13 manifest-backed
settings), environment variables (`.env` for secrets), and file-based config
(`.specify/` directory). Configuration is layered: defaults → user settings →
workspace settings, with workspace taking precedence.

## Repo-Owned Model Policy

Gofer bootstraps `.specify/memory/gofer-model-policy.yaml` from
`.specify/templates/gofer-model-policy.yaml`. The memory copy is user-owned and
is not overwritten by bootstrap. Use it to tune model routing:

- `simple`: cheap capable defaults for routine work.
- `mechanical`: ultra-cheap locate/classify/summarize routes where supported.
- `medium`: normal implementation, synthesis, validation, and research.
- `hard`: best available model for security, architecture, release-critical
  review, or repeated failure.
- `arbiter`: optional final frontier route for cross-model disagreements.

Copilot uses `Auto` for simple/default work because Copilot model availability
is controlled by the client, plan, and organization policy.

## VS Code Settings

### CLI Authentication

Gofer no longer stores provider API keys in VS Code settings. Claude, Codex,
Copilot, and Antigravity should use each tool's normal login/session state. For
CLIs that support environment fallback, set those variables in your shell or
secret manager, not in repository files.

**Security Notes:**

- Never commit API keys, tokens, or credentials to version control.
- Prefer `claude login`, `codex login`, Antigravity CLI login, and Copilot
  account state over direct provider SDK/API-key configuration.
- Gofer usage panels read local CLI usage artifacts and logs; they do not use
  Gofer-managed provider credentials.

### Workflow Profile

| Setting                 | Type    | Default      | Description                                                                                      |
| ----------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `gofer.workflowProfile` | enum    | `"standard"` | Public baseline workflow. Use `enterpriseai` only for older workflow contracts during migration. |
| `gofer.autoInitialize`  | boolean | `false`      | Auto-initialize `.specify/` on workspace open                                                    |
| `gofer.preferredAI`     | enum    | `"ask"`      | Preferred AI assistant: `ask`, `claude`, `copilot`, `codex`, `antigravity`                       |
| `gofer.defaultCLI`      | enum    | `"auto"`     | Default CLI surface: `auto`, `claude`, `copilot`, `codex`, `antigravity`                         |

### AI Usage and Billing

| Setting                           | Type    | Default   | Description                                                  |
| --------------------------------- | ------- | --------- | ------------------------------------------------------------ |
| `gofer.aiUsage.statusBar.enabled` | boolean | `true`    | Show current session AI usage cost in the VS Code status bar |
| `gofer.aiUsage.polling.interval`  | number  | `3600000` | Local usage polling interval when the watcher is not active  |

### CLI and Workflow Selection

| Setting                   | Type   | Default     | Description                                                                              |
| ------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------- |
| `gofer.cliProvider`       | enum   | `"auto"`    | AI CLI provider for autonomous mode: `claude`, `codex`, `copilot`, `antigravity`, `auto` |
| `gofer.claudeCodeCommand` | string | `"claude"`  | Command or path used when Gofer invokes the Claude Code CLI                              |
| `gofer.codexCommand`      | string | `"codex"`   | Custom path to the Codex CLI executable                                                  |
| `gofer.markdownViewer`    | enum   | `"preview"` | Markdown viewer integration to open when clicking files                                  |

### Context and Memory

| Setting                                | Type    | Default | Description                                                           |
| -------------------------------------- | ------- | ------- | --------------------------------------------------------------------- |
| `gofer.useLayeredMemory`               | boolean | `false` | Enable MemGPT-style layered memory (core, recall, archival)           |
| `gofer.observationPreservePatterns`    | array   | `[]`    | Extra regex patterns whose observations must never be masked          |
| `gofer.stageDetectionStalenessMinutes` | number  | `30`    | How long cached stage detection stays fresh before heuristic fallback |

## Environment Variables

Configuration via `.env` file (never commit to Git):

| Variable            | Required | Default          | Description                                     |
| ------------------- | -------- | ---------------- | ----------------------------------------------- |
| `ANTHROPIC_API_KEY` | No       | -                | Optional Claude CLI auth fallback               |
| `OPENAI_API_KEY`    | No       | -                | Optional Codex/OpenAI CLI auth fallback         |
| `LOG_LEVEL`         | No       | `info`           | Logging level: `debug`, `info`, `warn`, `error` |
| `SPECS_DIR`         | No       | `.specify/specs` | Specifications directory                        |
| `MAX_RETRIES`       | No       | `3`              | Max retries for failed operations               |

**Example `.env`:**

```bash
# Optional CLI auth fallback. Prefer provider CLI login state where possible.
ANTHROPIC_API_KEY=<anthropic-api-key>
OPENAI_API_KEY=<openai-api-key>

# Logging
LOG_LEVEL=info

# Orchestrator
SPECS_DIR=.specify/specs
MAX_RETRIES=3
```

## File-Based Configuration

### Constitution (`.specify/memory/constitution.md`)

Project-specific coding principles and guidelines enforced by ScopeGuard and
validation agents.

**Example:**

```markdown
# Project Constitution

## Coding Principles

### Error Handling

- All async functions must have try-catch blocks
- User-facing errors must be translated to readable messages
- Never log sensitive data (passwords, tokens)

### Security

- Never store passwords in plaintext
- Use bcrypt for password hashing (min 10 rounds)
- JWT tokens expire after 1 hour

### Testing

- All new functions require unit tests
- Integration tests for API endpoints
- Minimum 80% code coverage
```

### Spec Frontmatter Configuration

Each spec can override global settings via YAML frontmatter:

```yaml
---
id: '001-login-feature'
status: 'in_progress'
protected_files:
  - 'src/auth/*.ts'
  - '.env'
budget_override: 5.0 # Override global budget for this spec
---
```

## Configuration Precedence

1. **Workspace Settings** (`.vscode/settings.json`)
2. **User Settings** (VS Code global settings)
3. **Spec Frontmatter** (spec-specific overrides)
4. **Environment Variables** (`.env`)
5. **Defaults** (hardcoded in extension)

## Secrets Management

### Where to Store Provider Credentials

1. **Recommended:** Provider CLI login/session state
   - Run each provider's login command, for example `claude login` or
     `codex login`.
   - Let the provider CLI manage credentials outside the repository.

2. **Alternative:** Shell environment variables
   - Use only when a provider CLI requires or supports them.
   - Keep them in your shell profile, secret manager, or CI secret store.

3. **Not Recommended:** Workspace settings or repository files
   - `.vscode/settings.json`, `.env`, and scaffold files may be committed.
   - Use workspace settings only for non-sensitive Gofer behavior.

### Secret Rotation

- Rotate credentials through the provider CLI, provider console, or CI secret
  store.
- Keys are never logged or committed by Gofer.

## Required Configuration for Features

### Minimum Configuration (VS Code Extension Only)

```json
{
  "gofer.workflowProfile": "standard"
}
```

### Full AI Assistant Integration

```json
{
  "gofer.defaultCLI": "auto",
  "gofer.claudeCodeCommand": "claude",
  "gofer.codexCommand": "codex"
}
```

## Troubleshooting

### Issue: CLI Provider Not Authenticated

- **Cause:** Provider CLI is not logged in or its environment is missing.
- **Fix:** Run the provider login command, for example `claude login` or
  `codex login`.
- **Verify:** Check extension output: `View` → `Output` → Select "Gofer"

### Issue: Layered Memory Not Loading

- **Cause:** Layered memory is not enabled
- **Fix:** Enable layered memory: `"gofer.useLayeredMemory": true`
- **Verify:** Check that context assembly reports layered-memory use in the
  Gofer output log.

## Configuration Migration

### From v2.x to v3.x

- Review the manifest-backed settings above and remove any legacy workspace or
  user settings that no longer appear in the current `gofer.*` manifest.
- Refresh saved workspace examples to remove retired tuning keys and keep only
  manifest-backed settings such as `gofer.useLayeredMemory`.

### Legacy `enterpriseai` Compatibility

- Set `"gofer.workflowProfile": "enterpriseai"` only if you need older legacy
  workflow contracts during migration.
- Public Gofer usage should prefer `"gofer.workflowProfile": "standard"`.
- Track removal of legacy compatibility settings before a full public launch.
