# Antigravity Support

Reviewed 6 September 2026. This describes the local candidate, not a release.
Gofer's Google targets are Antigravity CLI and desktop. Gemini CLI is retired as
a Gofer surface. Gemini models and Google API products are not removed.

## Native Layout

The public bundle contains `plugins/antigravity/eai-gofer`. It includes a native
manifest, `eai` and `eai-update` skills, rules and all internal Gofer helpers.
Do not install the generic marketplace root as an Antigravity plugin.

| Surface             | Native location                                | Maintenance target         |
| ------------------- | ---------------------------------------------- | -------------------------- |
| Antigravity CLI     | `~/.gemini/antigravity-cli/plugins/eai-gofer/` | `antigravity`              |
| Antigravity desktop | `~/.gemini/config/plugins/eai-gofer/`          | `antigravity-desktop`      |
| Workspace skills    | `.agents/skills/`                              | Bootstrap the correct host |

The CLI uses `agy plugin install <local-plugin-directory>`. Check installed help
before use. Desktop can load workspace plugins from `.agents/plugins/`.
[CLI plugins](https://antigravity.google/docs/cli/plugins/),
[desktop plugins](https://antigravity.google/docs/plugins/).

## Migration

Keep `GEMINI.md`, `AGENTS.md` and `~/.gemini/GEMINI.md`. Antigravity still reads
these instructions. Do not remove the entire `.gemini` directory.

Gofer no longer emits Gemini CLI extension manifests or `.gemini/commands`. Old
host settings must explain migration rather than launch Gemini or silently
select another client. Existing release history is not rewritten.

Google offers `agy plugin import gemini`. It can import other extensions and
settings, so Gofer must not run it as an unattended update. User-edited files,
MCP servers, credentials and account settings must remain intact.
[Migration guide](https://antigravity.google/docs/cli/gcli-migration).

## Read-Only Checks

```sh
node .specify/scripts/node/gofer-surface-update.mjs --action inspect --host antigravity --json
node .specify/scripts/node/gofer-surface-update.mjs --action inspect --host antigravity-desktop --json
node .specify/scripts/node/gofer-model-discovery.mjs --host antigravity --surface cli --json
```

CLI presence does not prove desktop presence. `agy update` updates the CLI, not
Gofer. Do not invent `agy plugin update`. A blocked action is not success.
Automatic model/account discovery remains unverified; preserve the current
native model unless exact client and account evidence supports an override.

Native specialist agents inherit the selected model and use documented tool
arrays. Read-only reviewers have no shell or file-write tools. Claude's source
agents stay unchanged. Native subagent execution still needs a live-client test.
[Subagent format](https://antigravity.google/docs/subagents/),
[tool names](https://antigravity.google/docs/hooks/).

Desktop updates replace only an updater-owned, unchanged Gofer directory and
keep a backup. Modified or unowned installs stop for review. CLI installation
checks local help and reads back package contents. Replacing a different
existing CLI package remains blocked until the native replacement path is
verified.

## Native Evidence And Limits

Fresh CLI checks used `agy` 1.1.27 on macOS. Native package validation accepted
both public skills and all 42 specialist agents. `agy models` listed 14 models.
These checks do not prove model execution or account permission for each model.
This version treats `agy plugin install --help` as an install target. The
updater checks the parent help and validates the package before attempting
installation.

Fresh desktop execution was not run because the app was busy with another task.
No test prompt was sent to that task.

An earlier isolated test used desktop 2.12.2 on macOS. Its picker showed `eai`
and `eai-update`. The selected Gemini 3.8 Flash High ran the workspace checker.
Independent read-back verified a fresh marker, version, all 26 command files and
the stage heading. This was a workspace test plugin, not this released package.
It needed a scope correction; outside-workspace access was declined.

That result does not prove CLI execution, unattended updates, model switching,
or the complete app pipeline. Windows and Linux native clients need separate
evidence. Gemini Spark, Antigravity IDE variants and Grok are not certified by
these tests. See the current validation report for fresh results.
