---
generated: false
generated_at: '2026-06-01T00:00:00.000Z'
source_commit: 'manual-public-onboarding'
---

# First Run In Five Minutes

Use this path to verify that Gofer is installed, the repository scaffold exists,
and `/eai` can start or continue the delivery pipeline.

![Gofer first run demo](https://raw.githubusercontent.com/eai-tools/eai-gofer/main/assets/gofer-first-run.svg)

## What Success Looks Like

After the first run, the repository should contain:

- `.specify/.gofer-version`
- `.specify/commands/0_gofer_start.md`
- `.specify/templates/spec-template.md`
- `.specify/memory/gofer-model-policy.yaml`
- `.specify/specs/{feature}/business-scenario.md`

The public Gofer command should also be available on the host you installed:

- Claude Code: `/eai`
- Codex: `eai` skill or `$eai`
- GitHub Copilot: `#eai`
- Gemini CLI: `/eai`
- VS Code: **Gofer: Initialize Repository** and the Gofer panel

## 1. Install A Surface

### VS Code

Install from the Marketplace when published, or use the public VSIX fallback:

```bash
curl -fsSL https://eai-tools.github.io/eai-gofer/releases/eai-gofer-latest.vsix \
  -o /tmp/eai-gofer-latest.vsix
code --install-extension /tmp/eai-gofer-latest.vsix
```

### Claude Code

```bash
claude plugin marketplace add eai-tools/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer
claude plugin install eai-gofer@eai-gofer --scope user
```

### Codex

```bash
codex plugin marketplace add https://github.com/eai-tools/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer
codex plugin add eai-gofer@eai-gofer
```

### GitHub Copilot CLI

```bash
copilot plugin marketplace add https://github.com/eai-tools/eai-gofer
copilot plugin install eai-gofer@eai-gofer
```

### Gemini CLI

```bash
gemini extensions install https://github.com/eai-tools/eai-gofer --auto-update
```

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

## 3. Start The First Feature

Use the host-specific command syntax:

| Surface        | Copy-paste first command                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| VS Code        | Run **Gofer: Initialize Repository**, then ask your connected assistant with `/eai ...` |
| Claude Code    | `/eai I want to add passwordless login for customers`                                   |
| Codex          | `$eai I want to add passwordless login for customers`                                   |
| GitHub Copilot | `#eai I want to add passwordless login for customers`                                   |
| Gemini CLI     | `/eai I want to add passwordless login for customers`                                   |

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
