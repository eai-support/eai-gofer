# Gofer Agent Plugin

Version: 3.12.4

This package is the portable Claude, Antigravity, Codex, and Copilot workflow layer for Gofer. It is released beside the VS Code extension, but it does not replace the VSIX UI, status views, updater, or language-server features.

## Public Sources

Use the public GitHub repository as the install source for Claude Code, Codex and Copilot CLI. Antigravity uses the native sub-bundle:

```text
https://github.com/eai-support/eai-gofer
```

Use the public release host for downloadable artifacts:

```text
https://eai-support.github.io/eai-gofer/releases
```

That host publishes:

- Latest VS Code extension: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-latest.vsix`
- Latest agent bundle zip: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip`
- This release VS Code extension: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-3.12.4.vsix`
- This release agent bundle zip: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-3.12.4.zip`
- Claude marketplace manifest: `https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/claude-marketplace.json`
- Codex manifest: `https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/codex-plugin.json`
- Copilot marketplace manifest: `https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/copilot-marketplace.json`
- Antigravity native plugin: `https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/plugins/antigravity/eai-gofer`

## First EAI Platform App

Start with `/eai`, `#eai`, or `$eai` depending on the host. Gofer first classifies the request. If it is EAI app delivery or ambiguous, Gofer continues directly to EAI readiness and routes internally to the first-run setup contract when a new user, machine, repo, tenant, or EAI app template is not ready. If it is clearly non-app work, Gofer asks once before skipping EAI tenant/app setup and continuing the relevant research, documentation, audit, migration, or planning path. The setup path is allowed before `.specify/` exists. It checks Git, Node.js, npm, EAI CLI, registry, `eai update --check`, `eai --describe`, `eai agent guide --format json` when advertised, login, tenant, `eai init <project-name> --skip-prompts --company-tenant <active-tenant-id>`, Gofer scaffold readiness, and `eai errors explain <code-or-reason> --format json` for recovery across macOS, Linux, Windows, and GitHub Codespaces.

Gofer does not invent EAI CLI commands. It verifies command paths and flags with `eai --describe` and command-specific `--help` before suggesting or running them. If the installed CLI does not list a command, Gofer does not run it.

For EAI errors, Gofer expects agents to run live EAI guidance first, use `.specify/references/platform/eai-error-catalog.yaml` as fallback, run read-only diagnostics before mutating fixes, and stop at the retry/escalation condition. For `eai user invite` 5xx or `EXTERNAL_SERVICE_ERROR`, check existing members with `eai user list --tenant <tenant-id> --search <email> --format json`; use `eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json` only after verification and user approval. For `MISSING_TENANT`, `app_token_tenant_context_required`, or "Tenant context required for app tokens" on platform user lookup or membership prerequisites, run `eai errors explain app_token_tenant_context_required --format json`, confirm tenant context, and retry `/v4/platform/tenants/<tenant-id>/...` routes before changing tenant members, Entra, role definitions, databases, or cloud portals.

If `/eai` is unknown in a new repo, install or update this plugin first, then refresh/restart the host command picker.

## App-Native Surfaces And Repo Scripts

Gofer keeps repo-owned scripts and canonical command files as the source of truth. App plugins, skills, agents, and MCP tools are thin entry points that call or explain those repo scripts.

| Surface | Best entry point | Repo-owned files used |
| ------- | ---------------- | --------------------- |
| Codex App / Codex IDE | `eai` plugin skill when a workspace is open | `AGENTS.md`, `.agents/skills/`, `.specify/scripts/`, `.vscode/mcp.json` |
| GitHub Copilot app / VS Code agent mode | `#eai`, plus custom Gofer agents where supported | `.github/agents/`, `.github/skills/`, `.github/prompts/`, `.github/instructions/`, `.vscode/mcp.json` |
| Claude Code app | `/eai` plugin/repo command | `.claude/skills/`, `.claude/commands/`, `.claude/agents/`, `.specify/scripts/` |
| Antigravity CLI / desktop | `/eai` native skill | `.agents/skills/`, `GEMINI.md`, `.specify/scripts/` |
| Grok Build | Ask Grok to use the EAI skill | `.grok/skills/`, `.specify/scripts/` |

The clean UX rule is: users see only `eai`; Gofer keeps numbered stages and helpers as internal contracts under `.specify/commands/`.

## Update Cleanup

After each install or update, archive stale Gofer commands and settings:

```bash
node .specify/scripts/node/gofer-local-settings-cleanup.mjs --workspace . --apply --json
```

If the repo helper is not present yet, run the helper from the stable plugin bundle:

```bash
node ~/plugins/eai-gofer/.specify/scripts/node/gofer-local-settings-cleanup.mjs --workspace . --apply --json
```

Windows:

```bat
node %USERPROFILE%\plugins\eai-gofer\.specify\scripts\node\gofer-local-settings-cleanup.mjs --workspace . --apply --json
```

Then refresh or restart the host command picker.

## Local App Preview Runner

For EAI app delivery, start previews through the repo runner:

```bash
./run.sh dev 3001
```

Windows:

```bat
run.bat dev 3001
```

The runner stops any process on the selected port before it restarts the app.
Agents should not use direct `npm run dev` commands when the runner exists.

## Core Pipeline

| Stage | Internal contract | Main output |
| ----- | ------- | ----------- |
| Gofer Start | `.specify/commands/0_gofer_start.md` | Full pipeline kickoff |
| Research | `.specify/commands/1_gofer_research.md` | `research.md` |
| Specify | `.specify/commands/2_gofer_specify.md` | `spec.md` |
| Plan | `.specify/commands/3_gofer_plan.md` | `plan.md`, `data-model.md`, `contracts/` |
| Tasks | `.specify/commands/4_gofer_tasks.md` | `tasks.md`, `traceability.md`, `issues.md` |
| Implement | `.specify/commands/5_gofer_implement.md` | Code and doc changes |
| Validate | `.specify/commands/6_gofer_validate.md` | Validation artifacts and final review evidence |

The internal validation contract is the terminal quality gate. It includes the final engineering review loop and replaces the old standalone review stage in the core pipeline.

Optional helpers like problem validation, save, branding, tests, stakeholder comms, workspace checks, bootstrap, and EAI first-run remain available as internal contracts and can be routed by `gofer` when needed.

## Distribution Modes

| Surface | Public install / update path | Stable local path |
| ------- | ---------------------------- | ----------------- |
| Claude Code | `claude plugin marketplace add https://github.com/eai-support/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer` then `claude plugin install eai-gofer@eai-gofer --scope user` | Unzip to `~/plugins/eai-gofer`, then `claude plugin marketplace add ~/plugins/eai-gofer --scope user` |
| Codex | `codex plugin marketplace add https://github.com/eai-support/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer` then `codex plugin add eai-gofer@eai-gofer` | Unzip to `~/plugins/eai-gofer`, then `codex plugin marketplace add ~/plugins/eai-gofer` |
| GitHub Copilot CLI | `copilot plugin marketplace add https://github.com/eai-support/eai-gofer` then `copilot plugin install eai-gofer@eai-gofer` | Unzip to `~/plugins/eai-gofer`, then `copilot plugin marketplace add ~/plugins/eai-gofer` |
| Antigravity CLI / desktop | Use `eai-update` with the matching host target | Native bundle: `plugins/antigravity/eai-gofer`; do not install the generic root as an Antigravity plugin. |

## Download And Replace The Local Bundle Folder

Keep the downloaded bundle path stable:

```text
~/plugins/eai-gofer
```

Download the public release asset, remove the old folder, unzip the package into `~/plugins`.

```bash
curl -fsSL https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip -o /tmp/eai-gofer-agent-plugin-latest.zip

rm -rf ~/plugins/eai-gofer
unzip /tmp/eai-gofer-agent-plugin-latest.zip -d ~/plugins
node ~/plugins/eai-gofer/.specify/scripts/node/gofer-local-settings-cleanup.mjs --workspace . --apply --json
```

Windows PowerShell:

```powershell
Invoke-WebRequest https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip -OutFile "$env:TEMP\eai-gofer-agent-plugin-latest.zip"

Remove-Item "$env:USERPROFILE\plugins\eai-gofer" -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive "$env:TEMP\eai-gofer-agent-plugin-latest.zip" "$env:USERPROFILE\plugins" -Force
node "$env:USERPROFILE\plugins\eai-gofer\.specify\scripts\node\gofer-local-settings-cleanup.mjs" --workspace . --apply --json
```

## Claude Code

Recommended public install:

```bash
claude plugin marketplace add https://github.com/eai-support/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer
claude plugin install eai-gofer@eai-gofer --scope user
```

Downloaded bundle install:

```bash
claude plugin marketplace add ~/plugins/eai-gofer --scope user
claude plugin install eai-gofer@eai-gofer --scope user
```

## Codex

Recommended public install:

```bash
codex plugin marketplace add https://github.com/eai-support/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer
codex plugin add eai-gofer@eai-gofer
```

Downloaded bundle install:

```bash
codex plugin marketplace add ~/plugins/eai-gofer
codex plugin add eai-gofer@eai-gofer
```

The Codex plugin exposes only `eai` as the user-facing skill. The numbered stage contracts remain bundled under `.specify/commands/` so the public skill can route through the full pipeline without cluttering the picker.

## Copilot CLI

Recommended public install:

```bash
copilot plugin marketplace add https://github.com/eai-support/eai-gofer
copilot plugin install eai-gofer@eai-gofer
```

Downloaded bundle install:

```bash
copilot plugin marketplace add ~/plugins/eai-gofer
copilot plugin install eai-gofer@eai-gofer
```

## Antigravity CLI and Desktop

Use the native bundle at `plugins/antigravity/eai-gofer` inside this download.
CLI: check `agy plugin --help`, validate the native package, then install that local directory.
Desktop: the native plugin directory belongs under `~/.gemini/config/plugins/`.
Use `eai-update` with the exact host for managed updates. Restart the client
after a successful update. Do not copy the generic plugin manifest into the
native directory. Do not migrate credentials or other plugins automatically.
See [Google's migration guide](https://antigravity.google/docs/cli/gcli-migration).

## Model Policy

After bootstrap, each repository gets a user-owned model policy at:

```text
.specify/memory/gofer-model-policy.yaml
```

The shipped default is copied from `.specify/templates/gofer-model-policy.yaml`
and is not overwritten by bootstrap. Use it to tune simple, medium, hard, and
arbiter model routes for Claude, Codex/OpenAI, Gemini, and Copilot. Copilot
defaults to `Auto` for simple/default work because exact model availability is
controlled by the Copilot client, plan, and organization policy.
