# Grok Support Review

Reviewed 6 September 2026. These are local candidate changes, not a release.

## Verdict

Gofer includes Grok Build repository skills. Fresh macOS checks found Grok Build
1.0.13, signed in through grok.com. Native package validation passed. A real
read-only `/eai` request loaded the current workspace skill and returned the
fresh test marker, Gofer version, host and validation-stage heading correctly.
No Grok-named desktop app was found in the system or user Applications folder.

| Surface                          | Existing capability                                               | Remaining proof                                                              |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Grok Build CLI                   | Native discovery, local plugin install and read-only smoke passed | Full app journey, write/review isolation, release-to-release upgrade         |
| Grok Bot desktop                 | Official app supports plugins and skills                          | Compatible Gofer package, Bot instructions, workspace access and native task |
| Consumer or third-party Grok app | Not equivalent to either product above                            | Identify the host and verify its actual integration                          |

## What Changed

Gofer no longer says Grok lacks native plugin support. The gap is Gofer's
unverified install/update adapter. The updater recognizes `grok`, `grok-bot`,
and `grok-desktop`, but blocks install/update before any command or write. Its
Grok inspection now reads real CLI discovery, reports the public skill sources
and warns about older Gofer entries. It omits raw account, hook and MCP
configuration. It does not turn discovery into an execution-success claim.
Native installation was tested in a temporary home with no copied credentials.
Read-back found both public skills and all 42 namespaced Gofer agents. The
candidate also includes the existing documentation skill; it was left intact.
The local-source install is a symlink. Its update reports already live, which
does not prove a Git release upgrade or safe migration of an old global install.
It does not change `--host all`, migrate accounts, or delete existing skills.

Model guidance keeps CLI and desktop separate. A model list cannot prove
successful execution. Metadata in a skill cannot prove tool restrictions. The
full pipeline and existing repository skills remain available.

## CLI Checks

The documented skill root is `.grok/skills/`, with `SKILL.md` in each skill
folder. Grok also reads compatible Claude and AGENTS resources. Verify the
source selected for `/eai`; do not assume a compatible file means the host
instructions are correct. `model` and `effort` metadata are ignored.
`allowed-tools` does not enforce permissions. Never use it as proof that a
reviewer cannot edit files.
[Skills and plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces).

When Grok Build is installed, first verify native help. Then inspect the actual
repo with `grok inspect --json` and check `grok models` in that account context.
Keep raw configuration output private. Use `/eai` on a harmless local task and
verify the result. Native plugin subcommands exist, but this review does not
certify Gofer's arguments, package loading, or update behaviour.
[CLI reference](https://docs.x.ai/build/cli/reference).

For the current workspace:

```sh
node .specify/scripts/node/gofer-surface-update.mjs --action inspect --host grok --json
```

The native client can inherit an old Gofer plugin from Claude. The current
workspace skill can still work while an older extra command appears. Inspect the
source before cleanup. Do not remove the user's Claude plugin automatically.

Source review found that some plugin update failures can be reported without a
failing process exit. Future Gofer support must read back the installed package
and version, not trust exit status alone.
[Reviewed update code](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-pager/src/plugin_cmd.rs#L564).

## Desktop Checks

Grok Bot supports macOS, Windows, and Linux. App updates are separate from Gofer
updates. Use the official app settings and download source.
[Getting started](https://docs.x.ai/grok-bot/get-started).

Plugins and private skills use the app's Plugins settings. Skills can be enabled
for a Bot and referenced with `/`. That does not prove the existing Gofer CLI
bundle can load there.
[Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations).

Use the Bot description for persistent instructions. Model choice is managed by
the service; there is no model picker. Gofer must not pass a CLI model ID.
[Bot instructions](https://docs.x.ai/grok-bot/bots),
[Settings](https://docs.x.ai/grok-bot/settings-and-notifications).

Bots use an account cloud computer. A local checkout is not automatically
present there. Multiple Bots do not create separate security boundaries. Verify
workspace access and permission enforcement before app work or review.
[Architecture](https://docs.x.ai/grok-bot/overview).

The bundle now includes `.specify/references/grok-bot.md`: a persistent Bot
description, one-time setup request and separate desktop acceptance checks. It
preserves the internal pipeline and current-MVP gates. This is a setup contract,
not proof that the CLI package imports into the desktop app.

## Native Acceptance Still Required

Earlier regression evidence is superseded by the latest private feature report
in `.specify/specs/grok-native-surfaces/validation-report.md`. Native CLI smoke
evidence is separate from regression tests. The host reported model
`grok-4.6-build` for the `/eai` smoke; no model override was supplied. That
backend identifier is evidence from this run, not a selectable model default.
The CLI catalogue advertised `grok-4.6` and `grok-4.5`; no account-wide
availability or future model name is inferred from these results. A second
read-only request worked without `/eai`, guided by explicit Gofer instructions
in the isolated workspace. This does not certify every user-level install, every
future response or an undocumented desktop always-on mechanism.

1. Verify the exact client, account and Gofer package.
2. Confirm `/eai` loads the correct skill and every internal stage is reachable.
3. Test non-app work without tenant setup and an MVP with only its current
   gates.
4. Verify file edits, tests and previews in the actual workspace.
5. Prove permission limits and model identity where the host exposes them.
6. Test install/update and cleanup without changing unrelated settings.

Model inference ran only in an isolated, non-app test workspace using existing
login. Plugin installation used a separate temporary home. No global Gofer
installation, new login, deployment, merge, or release was performed.
