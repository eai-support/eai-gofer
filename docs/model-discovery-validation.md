# Surface Model Discovery Validation

## Google Surface Follow-Up

This section records earlier checks, not the current migration verdict. Gemini
CLI is now retired as a Gofer surface. Antigravity CLI and desktop use native
plugins. See [Google app support](google-surfaces.md) for the current contract.

Local checks on 6 September 2026 passed: 4,012 root tests and 596 routing/update
gate tests, with retries disabled. These overlap; do not add the counts.
Generation parity, surface release contracts, export layout, typecheck, lint,
and format checks passed. Preservation retains all 26 internal commands, 100
recorded surface paths, 44 VS Code command IDs and 13 settings. Nine protected
files remain byte-identical. The model policy and surface updater each have an
explicit reviewed migration with the original hash retained.

New checks distinguish Antigravity CLI, desktop, standalone IDE, VS Code
extension, and Gemini desktop. Gemini CLI remains a separate legacy target.
Unsupported Google installs stop before commands, cleanup, or instruction
writes. Native CLI model discovery and compatible Gofer packages for these new
targets remain unverified. The local `agy` executable is absent. A desktop
update probe correctly exited 1 with a blocked result and no update commands.

See [Google app support](google-surfaces.md). This increment corrects
recognition and reporting; it does not claim full new-host integration. Native
Google model execution, Spark uploads, desktop picker behaviour, and remote CI
were not run. The earlier VS Code and browser results below are previous-run
evidence, not fresh Google native tests. Independent review found no blockers in
this scope. Nothing was installed, pushed, merged, or released.

The remainder records the preceding model-discovery validation unchanged.

Date: 2026-09-06. Candidate: `feat/portable-orchestration-baseline`, based on
`74dc92000a9309d4735945b45227d1bcb4356f83` (Gofer 3.12.4), with local changes.

## Result

Local implementation and regression checks passed. Codex CLI read-only model
discovery worked with the current ChatGPT login. The reported `gpt-5.4` model
was not advertised. This is not proof of model execution or all-client support.
No user settings, plugins, accounts, production systems or releases were
changed.

## Changes

- New policies retain each app's native model selection instead of fixed IDs.
- Explicit choices require current account/client model and reasoning evidence.
- Codex CLI discovery runs outside the chat. It sends no model prompt or login
  request.
- Inherited reasoning settings are checked even when the selected model changes.
- Supplied catalogues remain caller-asserted. Only a native probe is labelled
  live.
- Other surfaces use their own native picker or metadata, not the Codex CLI
  list.
- Existing policies, stages, settings, acceptance checks, permissions and
  previews remain.
- Release validation includes the new discovery, policy, provider and package
  checks.

## Evidence

| Check                                                   | Result                                                                                    | Boundary                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Full root test suite                                    | 3,955 passed in 290 files; retries disabled                                               | Includes app/non-app, scaffolding, update, validation and provider regressions. |
| Expanded release gate                                   | 518 passed in 11 files                                                                    | Included within the root count, not additional tests.                           |
| Preservation check                                      | 26 internal commands, 100 recorded surface paths, 44 VS Code IDs and 13 settings retained | Ten protected contracts unchanged; one reviewed model-policy migration.         |
| Native VS Code 1.127.0 on macOS                         | 131 passed; 11 existing pending                                                           | Extension behavior, not each vendor's authenticated model picker.               |
| Chromium, Firefox and WebKit fixtures                   | 27 passed; 3 existing skips                                                               | Browser fixtures, not installed Copilot/Claude/Gemini apps.                     |
| Build, type-check, lint, generation and resource layout | Passed                                                                                    | Local build and generated contract evidence.                                    |
| Agent plugin and VSIX packaging                         | Passed                                                                                    | Local artifacts only; no public release or installation.                        |
| Live Codex CLI 0.153.4, base profile                    | Seven models advertised; configured selection supported                                   | Account-scoped metadata, no inference.                                          |
| Requested `gpt-5.4`                                     | Rejected as not advertised                                                                | No replacement chosen automatically.                                            |
| Named Codex `cloud` profile                             | BLOCKED: installed app-server rejects named profiles                                      | Base-profile results are not reused for that profile.                           |
| Codex desktop/IDE and other vendors' live discovery     | Not certified here                                                                        | Native-source guidance and supplied-catalogue tests only.                       |
| Model quality, response time and spend                  | Not measured                                                                              | No paid calls or equivalent live workload comparison.                           |

The installed Codex profile restriction is reported explicitly. A skill cannot
repair a rejected startup model before the first response. Use the external
diagnostic and the actual client's picker; see
[test instructions](testing-model-routing.md).

## Review Repairs

Independent review found two reasoning risks. Model changes could ignore an
inherited setting, and an empty model preference could drop a saved reasoning
setting. Both now fail safely or preserve a verified setting, with regression
tests. The CLI bridge requires live account evidence and a successful
configuration read. Native selectable model identifiers are kept separate from
catalogue display IDs.

Full-suite runs also exposed test setup issues. Temporary workspaces could be
removed before background writes finished. A watcher test used a fixed delay
instead of its ready event. The tests now wait for real completion, retain the
original speed limits, and assert that debounce produces an event. Saved command
fixtures changed only for the approved policy wording and matching line endings.
No assertions were removed, retries enabled, or new skips added.

The standard VS Code test launch exceeded the macOS socket path limit in this
long worktree path. The same suite passed with an isolated short temporary
user-data path. This did not alter the installed user's VS Code settings.

## Remaining Boundaries

The optional orchestration helper remains a decision planner, not a new model
execution engine. The existing Codex CLI provider now uses live metadata before
an explicit override. Claude's existing provider retains its native default;
explicit overrides need verified metadata rather than guessed model names.
Remote Windows/Linux CI, other apps' live model selection, and model outcome
comparisons still need separate evidence. No PR, merge or release is claimed.
