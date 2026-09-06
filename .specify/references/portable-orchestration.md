# Portable Delegation

## Business Outcome

Use extra model help only when evidence shows it is useful. Keep the current
pipeline, permissions, and previews. This is not a new public command.

## Stage Execution Bridge

The `/eai` controller must call the execution bridge for approved, useful
delegation, not merely read the planner's decision. This contract applies to all
26 canonical stages/helpers for both `app` and `non-app` work. Use the exact
`.specify/commands/*.md` filename stem as `stage`, including underscores in
helper stems; do not pass the frontmatter alias such as `gofer:diagnose`. Keep
helpers optional and session controls non-advancing. No stage is skipped or made
mandatory by routing.

At each meaningful stage boundary, inspect the task's route without making a
model call. Ordinary chat and stages with no useful delegation stay native, with
no discovery or inference for this hook. The standalone planner remains off by
default; this stage hook runs useful delegation once its task route is approved.
Preserve explicit disable. Reuse the approved task model, route and remaining
budget; do not ask for a fresh model/budget approval at every stage. Reusing
approval does not reset time, attempt or cost limits. Scope, provider, model or
budget changes still require the applicable approval. All mandatory
business-specification, security, paid-use, deployment and destructive-action
approvals remain in force.

The bridge enforces limits for one invocation. It does not own a persistent
task-wide spending ledger. The controller must subtract earlier usage and
elapsed time before each call. Do not describe these per-call bounds as a
verified cross-stage hard cap. If the task requires a hard aggregate cap that
the host cannot enforce, retain the existing path and report that limitation.

For `surface: "cli"`, use the internal command from the repository root:

```text
node .specify/scripts/node/gofer-stage-execute.mjs --input <relative request.json> --execute --output <new .specify/specs/feature/...json>
```

Run `node .specify/scripts/node/gofer-stage-execute.mjs --help` for the exact
input instructions. Replace the placeholders with a repository-relative request
file and a new output file beneath the active feature directory. Do not
overwrite earlier evidence. The command is an internal bridge, not a new picker
entry or a replacement for the stage's own work.

For `surface: "vscode-extension"`, call the native VS Code tool
`gofer_execute_stage` with `{request}`. Pass the same request object, not CLI
arguments or a JSON filename. Never substitute CLI for VS Code. If the tool is
unavailable, report that limit and retain the safe existing stage path; do not
present another surface's execution as a VS Code pass. This tool scopes
discovery and execution to the native `copilot` vendor. Models exposed by an
installed `copilotcli` provider are not substitutes.

### Request Contract

| Field                     | Required meaning                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                    | Actual host identity supported by this bridge, not an inferred provider or another installed app.                                                                           |
| `surface`                 | Exactly `cli` or `vscode-extension`; desktop/IDE diagnostics do not imply execution support.                                                                                |
| `stage`                   | Exact canonical command filename stem without `.md`, for any of the 26 stages/helpers.                                                                                      |
| `workType`                | `app` or `non-app`, using the already confirmed task classification.                                                                                                        |
| `trigger`                 | `ordinary`, `delegate`, `review`, or `failure`; an ordinary trigger alone does not justify delegation.                                                                      |
| `task`                    | Bounded work or review request, including the read-only proposal boundary and no-recursion instruction.                                                                     |
| `context`                 | Object containing `spec`, `acceptance`, `platform`, `language`, and `permissions`, each an array of 1-8 repository-relative text files. Combined content is at most 64 KiB. |
| `policy.enabled`          | Explicit optional-routing setting. False preserves the existing path without discovery/inference.                                                                           |
| `policy.approved`         | Actual task-level authorization, not approval manufactured by the controller.                                                                                               |
| `policy.route`            | Object with `pattern`, `worker`, and optional `critic` and `escalator`. Patterns are `single`, `cascade`, `critique`, and `peer-review`.                                    |
| `policy.maxAttempts`      | Approved attempt bound, 1-8, subject to the remaining task allowance.                                                                                                       |
| `policy.maxElapsedMs`     | Approved elapsed-time bound, 1-300000 milliseconds.                                                                                                                         |
| `policy.maxEvidenceAgeMs` | Maximum evidence age, 1-300000 milliseconds; stale evidence is not an escalation reason.                                                                                    |
| `policy.maxCostUsd`       | Include only when the native adapter enforces a hard dollar limit. Otherwise expect legacy `hard_cost_limit_unavailable`, not guessed pricing or an advisory substitute.    |

The optional `criterion` is a nonempty acceptance label. Use a curated feature
`context-bundle.md` for small, relevant inputs rather than copying the entire
stage or repository into prompts. The same bundle may appear in each context
category if it genuinely contains that category's rules. Do not include secret
files, credentials, binary content or symlinks. Each delegate output is limited
to 64 KiB. Unknown usage or cost remains unknown, not zero.

For example, an approved `peer-review` route can use `maxAttempts: 3`,
`maxElapsedMs: 120000` and `maxEvidenceAgeMs: 60000`, with worker and critic IDs
chosen from fresh native account evidence. These are illustrative bounds, not
defaults or permission to spend. Three attempts allow worker plus critic and
return to controller validation under the existing planner attempt bound. Most
adapters cannot enforce hard dollars: omit `maxCostUsd` only when no hard dollar
ceiling is required by the user's policy. If a hard ceiling is required but
unavailable, retain safe legacy behavior; never remove it to force execution.

Follow `--help` and the native tool schema for accepted route selectors and
validation rules. Do not invent worker IDs, model rankings or default ranks. The
bridge calls native current-account discovery before executing. Explicit
selectors must resolve against that host, surface, account and profile's fresh
evidence. Discovery is not inference proof. If an adapter cannot verify a
selector, required capability or account boundary, use the safe legacy path
where permitted, or report the required delegation/review blocked. Do not
silently change the user's selected model or call another provider.

### Execution And Return

All delegated results are read-only proposals, including implementation work.
Require host-enforced read-only access or tool-less execution. A prompt alone
does not establish that boundary. The controller checks the proposal against the
current revision and acceptance evidence. Before applying a proposal, recheck
every returned `inputFiles` entry, shaped as `{ref, sha256}`, against the
current file, including the canonical stage contract. Missing files or a hash
mismatch invalidate the proposal; obtain fresh evidence rather than apply stale
work. Apply only authorized changes. The bridge always returns
`canClaimDone: false`. The controller still runs all original tests, quality
gates, UI previews, diagrams, documentation and stakeholder outputs. Failed,
cancelled, stale or unverified results cannot be applied as accepted work or
counted as a completed stage.

Cascade and repair require fresh deterministic evidence from a trusted host
callback. Request JSON cannot authorize shell checks. Without that callback, the
CLI returns to controller validation rather than manufacture passing checks.

A trusted callback receives `output`, `attempt`, `expected` and `signal`. Return
the matching `expected` attempt ID, revision and criterion, plus the actual
`observedAtMs`, `ref`, `kind`, `status` and `deterministic` fields. An optional
redacted `summary` is limited to 4096 UTF-8 bytes; the complete record is
limited to 8192 bytes. Stale or mismatched observations are rejected, not
relabelled. The result retains `evidence`; escalation receives the matching
failure record. Do not include raw secrets or arbitrary fields.

Nested CLI delegates run with `GOFER_STAGE_DELEGATE=1`. The delegate prompt must
also say: "You are a read-only stage delegate. Do not invoke /eai,
gofer-stage-execute.mjs, gofer_execute_stage, or dispatch nested delegates.
Return a proposal and evidence to the controller; do not apply changes." The
prompt guard also applies to native VS Code delegates. When the environment
marker or delegated context is present, do not recursively dispatch this hook.

`peer-review` means a separate execution on a different model from the same
family. It must NEVER replace an existing different-family `critique`
requirement. Keep all six validation roles and the existing high-risk review
floor. If a qualified independent critic is unavailable, the required critique
remains blocked or unverified, not passed by peer review or self-review.
Different-family critique also requires native reported identities to match the
exact selected IDs. Unknown identities and unresolved aliases cannot prove that
obligation. Two selections that report the same actual model are rejected. Never
add an extra nested wrapper around a native compound workflow such as
HydraFusion. Its native execution still needs its own applicable evidence.

Antigravity hard read-only execution is currently unproved. Preserve safe legacy
behavior until the adapter supports and verifies that boundary. Model listing,
plugin layout, prompt instructions or an exit code cannot establish isolated
delegation. Do not report a false pass or invent read-only flags.

Reuse earlier confirmed non-app classification. Skip tenant/app setup, not
stages: do not run `eai whoami`, tenant selection, `eai init`, or first-run
setup for confirmed non-app work. Record app-only capabilities as
`not_applicable`. For app/MVP work, keep all gates capability-scoped to
implemented or currently required capabilities; absent future
authentication/deployment must not create new setup obligations. A required
capability still needs its original evidence. Context files carry the relevant
platform decisions, even where not applicable, plus language and permission
rules; do not assume delegates inherit them.

## Existing Path

The repo-owned `gofer-model-policy.yaml` remains the source of tier preferences,
not proof of model access. Preserve existing user files. Validate older pinned
model names against current surface evidence rather than running them blindly.
`simple`, `medium`, `hard`, and `arbiter` are roles, not model IDs. Resolve them
against the installed host's current tools and permitted models. Do not guess a
CLI command, model ID, or tool argument from a shared example.

If the repo policy has no arbiter entry, use its verified hard tier. Never fall
back to medium for an arbiter obligation. Keep the existing risk floor. If the
required tier is unavailable, report that limit rather than silently downgrading
its review. Model cost is not proof of model capability.

The `Task: subagent_type=... model_tier=...` examples in internal stages
describe the required agent and tier. They are not literal calls for every host.
On Claude, retain the corresponding existing agent role and verified model
alias. On other hosts, use their verified equivalent. If a separate agent is not
supported, do the existing task in the current session. Report that independent
model review was unavailable. Never skip required checks.

## Discover Before Selecting

For approved extra-model work in Copilot Chat inside VS Code, call native
`gofer_discover_models` (`#goferDiscoverModels`) with `{}` first. Then use its
current IDs with `gofer_execute_stage` (`#goferExecuteStage`). Discovery
performs no inference and does not grant execution consent. The adapter rechecks
IDs before use. If either tool is missing, report the missing tool once; do not
search historical logs, session stores or CLI catalogues as a substitute.
Confirm that the current chat exposes extension tools. Agent-host and remote
sessions do not inherit extension-host support. A matching version marker is not
proof: verify the installed manifest and current chat tool availability.

Native VS Code currently reports selection IDs, not backend model identity. Use
`peer-review` for an ordinary independent second execution. Use `maxAttempts: 3`
to permit two calls and the terminal validation decision. Do not use `critique`
unless verified different-family backend identity is available. A required
critique stays blocked; never downgrade that obligation. Discovery reports this
limit, and execution rejects unsupported critique before paid calls. Do not
infer cost or quality rankings from catalogue names.

Before any model override, identify the actual host, client surface (CLI,
desktop or IDE), account/provider mode and selected profile. Discover there. A
public API list, another app's model menu or an old cache is not evidence for
this client. Do not rank models by version number or assume a larger name is
stronger. Native current/default selection is not a high-risk qualification.

| Surface                                                  | Model source                                                                                                | Safe boundary                                                                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI                                                | Account-scoped app-server `model/list`, with the same profile; `account/read` and `config/read` for context | Use the read-only Gofer discovery helper before the first prompt if startup fails. Do not substitute the API model catalogue.                                                                               |
| Codex desktop / IDE                                      | The active host's model picker or exposed model metadata                                                    | A separate CLI process does not certify desktop or remote-host availability.                                                                                                                                |
| Claude Code                                              | `/model` for the current account/provider; native SDK metadata only when exposed by the installed client    | Preserve Default and account restrictions. Do not send OpenAI IDs or API-only names to Claude.                                                                                                              |
| Copilot CLI                                              | `/model` or the installed account-scoped SDK model list when exposed                                        | Keep Auto where selected and available. Public help examples are not account entitlement.                                                                                                                   |
| Copilot desktop                                          | That app's current picker or native catalogue                                                               | Do not reuse the CLI or VS Code catalogue.                                                                                                                                                                  |
| VS Code extension                                        | `request.model` for chat; user-initiated `vscode.lm.selectChatModels()` for discovery                       | Respect the selected vendor, consent and empty results. Do not hardcode a family.                                                                                                                           |
| Antigravity CLI (`agy`)                                  | `agy models` in the current account/provider context; verify installed help first                           | The stage adapter parses a constrained native format, but hard read-only execution remains unproved. Do not infer account binding, isolation, JSON flags or effort options from parser presence.            |
| Antigravity desktop / standalone IDE / VS Code extension | The current app's model picker                                                                              | CLI, desktop and IDE access need separate evidence, even where the harness is shared. The standalone IDE is not the VS Code extension.                                                                      |
| Grok Build CLI                                           | `grok models` for the current provider/account; verify installed help                                       | The stage adapter rejects unknown catalogue formats. Parser support is not live discovery or execution proof. Skill `model`/`effort` fields are not applied; `allowed-tools` does not restrict permissions. |
| Grok Bot desktop                                         | Service-managed model choice; no model picker                                                               | Do not send CLI model overrides. Separate Bots are not separate security boundaries.                                                                                                                        |
| Other Grok desktop wrappers                              | Identify the vendor, product and current host tools first                                                   | A Grok model or API key does not prove Grok Build or Grok Bot integration.                                                                                                                                  |

Check the exact advertised model ID and reasoning options. Do not attach an old
reasoning level to a model that does not advertise it. Keep the user's native
selection for ordinary work where no override is required. If a required
explicit model or qualified reviewer is unavailable, report that specific limit.
Do not silently choose a different provider or weaken checks.

Use `node .specify/scripts/node/gofer-model-discovery.mjs --help` for the
supported diagnostic contract. The helper sends no model prompt, creates no
thread and changes no user configuration. Discovery means advertised access, not
successful model execution. Never turn a manually supplied catalogue into a
claim that Gofer queried the host itself. Refresh evidence when the host,
profile, provider, account, model choice or rejection changes.

## Google Product Boundaries

Gofer's active Google surfaces are Antigravity CLI and desktop. Gemini CLI is
retired as a Gofer host. This does not retire Gemini models or Google APIs. Keep
GEMINI.md: Antigravity still uses it. Preserve unrelated legacy settings.

For discovery, use product `antigravity` with surface `cli`, `desktop`, `ide`,
or `vscode-extension`. IDE and extension results remain separate diagnostics,
not proof of full integration. Product `gemini` returns a retired-host result.
These identities must never share catalogue evidence. A public model list is not
account authorization.

Use `antigravity` for CLI maintenance and `antigravity-desktop` for desktop.
Other Google product identifiers must not invoke Gemini extension commands.
Report native validation limits. `all` does not authorize broad migration of the
user's other plugins, accounts or credentials.

The native Gofer bundle is `plugins/antigravity/eai-gofer`. Do not install the
generic marketplace manifest as an Antigravity plugin. `agy update` updates the
CLI, not Gofer. Do not invent `agy plugin update`. Verify installed help before
`agy plugin install` and verify the installed result before reporting success.
Desktop uses its own native plugin folder. Suppress CLI background auto-update
for diagnostics with `AGY_CLI_DISABLE_AUTO_UPDATE=true`.

Google's migration guide provides `agy plugin import gemini`. It can import more
than Gofer; do not run it as an unattended Gofer update. Workspace skills belong
in `.agents/skills`. Shared `.gemini/GEMINI.md` is not obsolete data. Preserve
the user's normal session when an optional adapter is unavailable; never weaken
delivery checks.

## Grok Product Boundaries

Grok Build supports native skills, plugins, marketplaces and repository
instructions. Gofer already generates `.grok/skills/eai/SKILL.md` with the full
repo pipeline. This matches the documented layout, not verified live loading.
Grok can also read Claude and user-level AGENTS skills. Inspect the selected
skill source; do not delete other surfaces or mistake imported Claude guidance
for the current client. Internal stages must stay reachable from `/eai`.

`grok inspect --json` reports discovered configuration and skills. Check native
help before use and treat raw output as private. `grok models` lists models; it
does not prove inference or desktop entitlement. Do not infer independent review
from ignored `model`, `effort`, or `allowed-tools` skill metadata. Use verified
host-enforced tool restrictions and a separate execution.

The update helper recognizes `grok` for Build CLI and `grok-bot` for the
official desktop app. `grok-desktop` means the product still needs identifying.
Gofer's automatic install/update adapter remains unverified and blocked before
writes. This is a Gofer integration gap, not an absence of Grok plugin support.
Keep existing repository skills. Do not invent a marketplace or plugin command.
Future native update support must read back the installed package and version. A
successful process exit alone is not proof that a plugin update succeeded.

Grok Bot uses Plugins settings and private skills. Persistent Bot instructions
belong in its description. Its account cloud computer is separate from the local
repository, and multiple Bots are not separate security boundaries. There is no
model picker: model selection is service-managed. Do not promise local scaffold
access, CLI authentication, always-on `/eai`, or isolated review without fresh
native evidence. Use discovery product `grok-bot`, surface `desktop`, not the
Build CLI account catalogue. Consumer and third-party Grok apps need their own
integration checks.

## Startup Failure

A skill cannot repair a model that fails before the first response. Run the
discovery diagnostic from the terminal, outside the failed chat. Inspect the
selected profile as well as the base configuration. Use an advertised model from
that same context for a session-only override, then retry the prompt. Ask before
editing user configuration. Do not replace every user's model with the model
that happens to work on this machine. If app-server rejects a named profile,
report blocked profile discovery. Never present the base catalogue as evidence
for that profile. Use that profile's native picker when available.

## Optional Decision Helper (Planning Only)

The helper is off by default. It is not a new execution engine. It does not run
models, change a workspace, or replace final validation. Do not invoke it or
inspect models on every ordinary message. Use it only before approved delegated
work. Record approval, limits, and fresh non-secret host capabilities. Resolve
the user's model policy against the actual available model list.

Use `node .specify/scripts/node/gofer-orchestration.mjs --help` for its separate
planning input contract. It does not accept the stage-execution request in place
of that contract and does not dispatch models. For `/eai` stage integration,
call the Stage Execution Bridge above after task approval. A planner result is
not execution evidence. Record actual models, checks, and usage in the feature
loop ledger. The trusted host must enforce its tool restrictions and limits.

| Route       | Use                                        | Required evidence                                                                                 |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Existing    | Default or unsupported optional capability | Preserve current checks and user settings                                                         |
| Single      | One verified model can do the work         | Available model and current task context                                                          |
| Cascade     | A failed check needs a stronger attempt    | Current revision, acceptance item, and failed check                                               |
| Critique    | Independent review helps a complex change  | Different model family and enforced read-only review                                              |
| Peer review | A same-family second model adds review     | Separate execution and different model; never a substitute for required different-family critique |

Confidence alone cannot trigger cascade. Stale evidence cannot justify another
attempt. Critical tasks can still start at the existing hard tier. Do not force
a cheap first attempt for security or release-critical work. Do not add an outer
model loop to a native compound workflow such as HydraFusion. Keep Gofer's
acceptance checks. Stop on cancellation or budget limits.

## Delegate Context

Pass the active goal, spec and revision, acceptance criteria, relevant changes,
test evidence, EAI service decisions, language rules, and allowed actions. For
confirmed non-app work, mark EAI app setup not applicable. For an early MVP,
include only its currently required capabilities. Do not assume that subagents
inherit parent skills or permissions. Keep context small and free of secrets.
Reuse stable non-secret context when host caching is available. Record missing
usage or cost as unknown, not zero.

A critic must not edit files or use write-capable tools. Use host-enforced
read-only isolation or tool-less review. If this boundary is unavailable, do not
claim isolated review. Verify candidates against the current revision and tests
before application. Never automatically apply a failed, cancelled, stale, or
unverified candidate. The controller, not this planner or its delegates,
enforces application.

## Preserved Delivery Rules

Keep every stage, helper, template, diagram, and stakeholder output. Show UI
changes promptly. The runner proves launch, not sign-in or EAI access. Keep
capability-scoped MVP checks, scope-change updates, and release evidence. A
routing decision cannot mark work complete or raise a validation score. Keep the
user's provider and surface unless they approve a change. Do not install tools,
create credentials, or use paid providers as automatic fallback.

## Evaluation And Rollout

In the Gofer source repo, use `docs/portable-orchestration-rubric.md` as the
baseline. Compare quality, first useful preview, total duration, and full cost
on identical tasks and budgets. Use held-out tasks, repeat runs, changes of
scope, interrupted sessions, and non-app requests. Report missing live evidence
as unverified. Do not substitute generated-file checks for live model quality or
host tests.

The pure planner remains planning-only. The separate stage execution bridge
connects approved delegation to supported native adapters; the automatic hook
does not enable routing by default. Disable the optional policy to retain the
existing path; no data migration is needed.

Report **native execution validation** and **automatic pipeline validation**
separately. A direct bridge call may prove a native model ran without proving
that `/eai` selected the stage, called the bridge, applied an authorized
proposal, and completed its original checks. Contract tests and generated
instructions prove neither installed behavior nor model quality. Record each
host/surface, app/non-app case, policy, actual model, boundary, result and
remaining gates. Missing or unsupported surface evidence stays unverified.
Native HydraFusion and automatic default enablement need separate live proof.

## Research Sources

- [HydraFusion research](https://github.blog/ai-and-ml/github-copilot/project-hydrafusion-frontier-quality-via-multi-model-orchestration/)
- [Availability and limits](https://github.com/orgs/community/discussions/206492)
- [Agent context and tools](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
- [Public event types](https://github.com/github/copilot-sdk/blob/main/nodejs/src/generated/session-events.ts)
- [Codex model/list and configuration](https://developers.openai.com/codex/app-server/)
- [Claude account model configuration](https://code.claude.com/docs/en/model-config)
- [Copilot CLI model picker](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- [VS Code selected model and discovery](https://code.visualstudio.com/api/extension-guides/ai/language-model)
- [Gemini model selection and subagent limits](https://geminicli.com/docs/cli/model/)
- [Google consumer transition and enterprise exceptions](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [Antigravity CLI plugins](https://antigravity.google/docs/cli/plugins/)
- [Antigravity CLI release notes and model listing](https://antigravity.google/changelog)
- [Antigravity desktop models](https://antigravity.google/docs/models/)
- [Antigravity CLI authentication](https://antigravity.google/docs/cli/install/)
- [Antigravity CLI updater controls](https://antigravity.google/docs/cli/troubleshooting/)
- [Gemini desktop app](https://support.google.com/gemini/answer/17011627)
- [Gemini Spark folder access](https://support.google.com/gemini/answer/17208717)
- [Gemini Spark skill uploads and limits](https://support.google.com/gemini/answer/17094296)
- [Antigravity standalone IDE](https://antigravity.google/docs/ide/overview/)
- [Antigravity VS Code extension](https://antigravity.google/docs/ide/extensions/vscode/)
- [Grok Build skill metadata and compatibility](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Grok Build CLI commands](https://docs.x.ai/build/cli/reference)
- [Grok Bot plugins and skills](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [Grok Bot model selection](https://docs.x.ai/grok-bot/settings-and-notifications)
- [Grok Bot instructions](https://docs.x.ai/grok-bot/bots)
- [Grok Bot shared cloud computer](https://docs.x.ai/grok-bot/overview)

Reviewed 2026-09-06. These sources do not prove live support in every host.
