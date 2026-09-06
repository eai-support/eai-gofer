---
generated: false
generated_at: '2026-06-01T00:00:00.000Z'
source_commit: 'manual-public-onboarding'
---

# First Run In Five Minutes

Use this path to verify that Gofer is installed, the repository scaffold exists,
and `/eai` can start or continue the delivery pipeline.

![Gofer first run demo](https://raw.githubusercontent.com/eai-support/eai-gofer/main/assets/gofer-first-run.svg)

## What Success Looks Like

After the first run, the repository should contain:

- `.specify/.gofer-version`
- `.specify/commands/0_gofer_start.md`
- `.specify/templates/spec-template.md`
- `.specify/memory/gofer-model-policy.yaml`
- `.specify/specs/{feature}/business-scenario.md`

The public Gofer commands should also be available on the host you installed:

- Claude Code: `/eai`
- Codex: `eai` skill or `$eai`
- GitHub Copilot: `#eai`
- Antigravity CLI: `/eai`
- Grok Build: ask Grok to use the repository EAI skill
- VS Code: **Gofer: Initialize Repository** and the Gofer panel

`eai-update` updates the host-level Gofer plugin or extension. It does not need
an EAI project, a Gofer scaffold, or an EAI login. Use `/eai-update`,
`#eai-update`, or `$eai-update` when Gofer is already available in the host.

## 1. Install A Surface

### VS Code

Install from the Marketplace when published, or use the public VSIX fallback:

```bash
curl -fsSL https://eai-support.github.io/eai-gofer/releases/eai-gofer-latest.vsix \
  -o /tmp/eai-gofer-latest.vsix
code --install-extension /tmp/eai-gofer-latest.vsix
```

### Claude Code

```bash
claude plugin marketplace add eai-support/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer
claude plugin install eai-gofer@eai-gofer --scope user
```

### Codex

```bash
codex plugin marketplace add https://github.com/eai-support/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer
codex plugin add eai-gofer@eai-gofer
```

### GitHub Copilot CLI

```bash
copilot plugin marketplace add https://github.com/eai-support/eai-gofer
copilot plugin install eai-gofer@eai-gofer
```

### Antigravity CLI And Desktop

Use the native `plugins/antigravity/eai-gofer` folder in the public bundle. CLI:
check `agy plugin --help` and validate the native package before installing it.
Desktop: native plugins load from `~/.gemini/config/plugins/`. Use `/eai-update`
with `antigravity` or `antigravity-desktop` for later updates. Gemini CLI is
retired. Keep shared `GEMINI.md` rules and unrelated settings.
[Migration guide](https://antigravity.google/docs/cli/gcli-migration).

### Grok Build

Run `eai gofer refresh` in the project, then start Grok with `eai start`. The
CLI opens the project and asks Grok to use `.grok/skills/eai/SKILL.md`.

## 2. Initialize The Repository

For a first EAI Platform app, run:

```text
/eai I want to create my first EAI Platform app
```

Gofer checks Git, Node.js, npm, the scoped EAI registry, EAI CLI, login, tenant
access, project folder, EAI app template readiness, and Gofer scaffold health
before design work begins.

In VS Code, **Gofer: Initialize Repository** remains available when you only
need the repo-owned Gofer scaffold.

In a CLI host, you can still ask through `/eai` when you are not creating an EAI
Platform app:

```text
/eai add or refresh the Gofer scaffold for this repo
```

If a command detects a missing or stale scaffold, it should ask:

```text
This repo is missing or stale for Gofer. Initialize/update it now?
```

Choose yes. Gofer should create or refresh `.specify/`, host command files, and
the model policy template.

If `/eai` is unknown, install or update the Gofer plugin for the host first,
then refresh or restart the host command picker. The public command is designed
to work before `.specify/` exists.

## Update A Surface Without A Repository

Use the public update command in a host that already has Gofer:

| Surface         | Command       | Required refresh                            |
| --------------- | ------------- | ------------------------------------------- |
| Claude Code     | `/eai-update` | `/reload-plugins`                           |
| Codex           | `$eai-update` | Start a new task or restart Codex           |
| GitHub Copilot  | `#eai-update` | Restart the session or start a new app chat |
| Antigravity CLI | `/eai-update` | Start a new Antigravity CLI session         |
| VS Code         | `#eai-update` | **Developer: Reload Window**                |

The command checks status, shows the planned user-level change, asks for
approval, and then installs or updates only the current host. After an actual
update, it archives known stale Gofer commands and skills. It keeps the current
`eai` and `eai-update` entries. If Codex uses a local marketplace, it reports
the local source and makes no changes to that checkout or its settings. If the
source cannot be confirmed, it stops without changes. It can update all
supported hosts only when you explicitly ask for that.

## First Install Without A Repository

`/eai-update` is available after the first Gofer install. For a new machine,
download the small public helper. It needs Node.js, but it does not need a
repository, EAI login, or EAI project.

macOS and Linux:

```bash
(
set -eu
helper_dir="${TMPDIR:-/tmp}/eai-gofer-update"
mkdir -p "$helper_dir/lib"
curl -fsSL https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gofer-surface-update.mjs \
  -o "$helper_dir/gofer-surface-update.mjs"
curl -fsSL https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gofer-local-settings-cleanup.mjs \
  -o "$helper_dir/gofer-local-settings-cleanup.mjs"
updater_source="$(cat "$helper_dir/gofer-surface-update.mjs")"
case "$updater_source" in
  *"./lib/grok-surface.mjs"*)
    curl -fsSL https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/lib/grok-surface.mjs \
      -o "$helper_dir/lib/grok-surface.mjs"
    ;;
esac
node "$helper_dir/gofer-surface-update.mjs" --action install --host codex --execute --json
)
```

Windows PowerShell:

```powershell
& {
$ErrorActionPreference = 'Stop'
$helperDir = Join-Path $env:TEMP 'eai-gofer-update'
New-Item -ItemType Directory -Path (Join-Path $helperDir 'lib') -Force | Out-Null
$helper = Join-Path $helperDir 'gofer-surface-update.mjs'
Invoke-WebRequest https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gofer-surface-update.mjs -OutFile $helper -ErrorAction Stop
Invoke-WebRequest https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gofer-local-settings-cleanup.mjs -OutFile (Join-Path $helperDir 'gofer-local-settings-cleanup.mjs') -ErrorAction Stop
$updaterSource = Get-Content -LiteralPath $helper -Raw -ErrorAction Stop
if ($updaterSource.Contains('./lib/grok-surface.mjs')) {
  Invoke-WebRequest https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/lib/grok-surface.mjs -OutFile (Join-Path $helperDir 'lib/grok-surface.mjs') -ErrorAction Stop
}
node $helper --action install --host codex --execute --json
if ($LASTEXITCODE -ne 0) { throw "Gofer installation failed (exit $LASTEXITCODE)." }
}
```

These commands work before and after the next release: the published 3.12.4
helper needs two files; the newer helper also needs `lib/grok-surface.mjs`. The
extra file is fetched only when the downloaded helper references it. Any
required download or read failure stops before installation. Keep the downloaded
files together in the shown layout, including `lib/` when required. Replace
`codex` with `claude`, `copilot`, or `vscode`. Use `all` only when you want
those supported hosts updated together. Antigravity CLI and desktop need the
full native bundle described above, not this small helper download. Grok Build
now supports native plugins and marketplaces. Gofer's automatic plugin
install/update integration is not yet verified. Keep the existing repository
skill and full scaffold. Grok Bot desktop is separate from the CLI; neither its
plugin compatibility nor its access to a local repo is established by CLI
support. See
[Grok support and test limits](https://github.com/eai-support/eai-gofer/blob/main/docs/grok-surfaces.md).

## 3. Start The First Feature

Use the host-specific command syntax:

| Surface         | Copy-paste first command                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| VS Code         | Run **Gofer: Initialize Repository**, then ask your connected assistant with `/eai ...` |
| Claude Code     | `/eai I want to add passwordless login for customers`                                   |
| Codex           | `$eai I want to add passwordless login for customers`                                   |
| GitHub Copilot  | `#eai I want to add passwordless login for customers`                                   |
| Antigravity CLI | `/eai I want to add passwordless login for customers`                                   |
| Grok Build      | `Use the repository EAI skill. I want to add passwordless login for customers.`         |

For first EAI Platform app setup, use the same `/eai` command. It will handle
EAI CLI, login, tenant, app template, and Gofer scaffold readiness before it
starts feature design.

Answer the questions Gofer asks about business value, users, constraints,
success measures, risks, and known systems.

## 4. Confirm The First Artifact

The first successful command should write:

```text
.specify/specs/{feature}/business-scenario.md
```

From there, continue with normal business-language requests:

```text
/eai research the options and explain the trade-offs
/eai turn this into the spec and plan
/eai build it, show me the UI, and validate it
```

Gofer routes those requests through its internal research, specify, plan, tasks,
implement, and validate contracts. Validation is the terminal quality gate and
includes the engineering review loop.

## 5. Where To Ask For Help

- Use Discussions for install help, workflow questions, examples, and roadmap
  ideas.
- Use Issues for confirmed bugs, scoped features, regressions, and packaging
  failures.
- Use the security policy for vulnerabilities or sensitive reports.
