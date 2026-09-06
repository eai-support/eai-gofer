# Test Model Routing In This Surface

## Start Outside The Chat

Open the candidate Gofer workspace. Read the diagnostic help from the terminal:

```text
node .specify/scripts/node/gofer-model-discovery.mjs --help
```

For Codex CLI with a ChatGPT login and no named profile:

```sh
node .specify/scripts/node/gofer-model-discovery.mjs --host codex --surface cli --json
```

This lists advertised models and checks the resolved selection. To diagnose the
reported rejection, add `--requested-model gpt-5.4`. This checks the name; it
does not run that model. Use `--profile <name>` only for the actual profile.
Some Codex versions reject named profiles for app-server discovery. The helper
reports that limitation instead of using the base configuration as a substitute.

Use the discovery options for the actual surface, account and profile. The Codex
CLI implementation can read its account-scoped catalogue without a model turn.
An unsupported startup model cannot be fixed by instructions sent through that
same broken model. Do not solve it by copying a model name from this guide.

If the selected model is absent, choose an advertised entry in that client's
picker or use a session-only override. Verify the installed CLI help before
using flags. Keep user configuration unchanged unless the user approves a fix.

For other clients, follow the native-source matrix in
[portable delegation](../.specify/references/portable-orchestration.md). Report
unavailable discovery honestly. Do not use a CLI catalogue as proof of the
desktop app's models, or an API catalogue for a subscription login.

## Paste Into A Working Session

```text
Validate Gofer model discovery and routing in this coding app.
This is approved product testing, not customer EAI app delivery.
Do not change production, accounts, user-level plugins or global settings.

Record the actual host, desktop/CLI/IDE surface, version, operating system,
Gofer candidate branch and commit, provider/login mode and selected profile.
Do not print credentials or personal account information.

Before selecting a model, obtain this surface's current native model list.
Use the installed client's supported discovery API or picker.
Do not copy model IDs from another app, API documentation or an old policy.
Record the catalogue source, time and whether discovery was live or supplied.
If discovery is unavailable, say BLOCKED. Do not invent a list or command.

Verify each proposed model and reasoning option against that exact catalogue.
Treat repo model settings as preferences, not proof of access. Preserve them.
Keep native current/default selection when no override is needed.
Do not call the default model qualified for a hard review without evidence.

Run the relevant candidate tests. Keep simulated helper tests, package checks,
real model execution, and quality/speed comparisons separate.
If the execution connection is missing, report NOT IMPLEMENTED.
Do not build missing integration during this validation.

Test simple work, non-app research, a local MVP, evidence-based escalation,
independent review, unavailable models, stale catalogues and cancellation.
Use isolated fixtures and existing host access. Ask before paid provider
changes or installs. Do not add auth gates to an MVP without auth implemented.
Keep all existing acceptance checks and early UI previews.

Compare equivalent old/new starting copies and accepted outcomes where live
execution exists. Record actual models, results, time and reported usage.
Unknown cost is UNKNOWN, not zero. Catalogue discovery is not execution proof.

Write a private local report. Use PASS, FAIL, BLOCKED, NOT IMPLEMENTED or
NOT PRESENT for each check. Include source evidence and remaining gaps.
Do not commit, push, merge or release. Give the report path and a short verdict.
```

Repeat in each supported client. A successful run in one client does not certify
the same vendor's other clients or another account.
