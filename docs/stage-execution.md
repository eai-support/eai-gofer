# Extra Model Help Through EAI

Use `/eai` as before. There is no new public command to learn.

Extra model help gives you a second opinion, not a finished feature. Gofer must
still test the required behaviour before it reports the feature complete. Direct
model execution has been tested on selected surfaces. Automatic chat use and
complete delivery journeys remain separate checks, not implied passes.

At each useful stage, Gofer checks whether extra model help is warranted. It
uses the approved task route and models available in the current coding tool.
Simple questions stay in the current session. Extra calls are not required at
every stage or for every message.

| Stage     | What extra help can do                               | What the main session still does                              |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Start     | Challenge assumptions and clarify the business need. | Confirm scope and update the feature record.                  |
| Research  | Compare evidence and identify gaps.                  | Check sources and explain the findings.                       |
| Specify   | Review acceptance criteria and missing requirements. | Keep the specification current and obtain required decisions. |
| Plan      | Review design choices and risks.                     | Retain EAI-first decisions for apps and maintain the plan.    |
| Tasks     | Check task coverage and dependencies.                | Maintain traceability and the task list.                      |
| Implement | Propose changes or review a proposed change.         | Make approved edits, run checks, and show the UI early.       |
| Validate  | Independently review the evidence.                   | Run acceptance checks and report remaining failures.          |

The same connection covers optional stages, helpers, and session controls. They
remain optional. A research or documentation task does not require EAI login or
app setup. Early app work still uses MVP-aware checks; future authentication
requirements do not block a local preview.

## Control And Limits

Delegates receive selected context and the previous model's actual output. They
cannot edit files through this bridge. The main session checks their proposals
against current inputs before applying changes. A model answer is not proof that
a feature works.

Separate models from one family provide peer review. They do not replace a
required different-family review. Disabled routing, unavailable models, stale
inputs, cancellation, and unsupported isolation retain the safe existing path or
report the required work blocked. They never become a passing result.

The engine limits each call sequence. The main session must track the remaining
task-wide allowance. A hard total cost ceiling is unsupported unless the host
can enforce it. Unknown cost remains unknown.

Automatic escalation requires current deterministic check evidence from a
trusted host callback. The CLI bridge returns to the main session for checks; it
does not execute arbitrary check commands from a request file.

## Implementation Boundary

CLI stages use the repository-owned `gofer-stage-execute.mjs` bridge. VS Code
uses its native `gofer_execute_stage` tool with the Copilot provider; it does
not use Copilot CLI as a substitute. Models are discovered in that surface.
Antigravity retains the existing path while enforced read-only execution is
unverified. Other desktop clients must not claim CLI evidence as their own.

The latest Codex security check also found that native read-only mode can read
outside the supplied review context. This candidate is not qualified for Codex
delegate execution. Normal Gofer work in the main session remains available. See
the [release status](portable-orchestration-release-status.md) for open release
blockers; earlier successful calls do not prove isolation.

### Antigravity Review Safety

You do not need to change your normal permissions or learn a test command. Gofer
must qualify its extra reviewer before enabling that route. This does not
require making your normal app-building session read-only.

The check must use disposable files. It must prove that reading works and
editing, shell writes, external actions and broader delegation are blocked. Plan
mode, a sandbox flag, a configured agent name or unchanged files alone do not
prove that protection. A quota error leaves execution untested.

On this candidate, Antigravity review remains blocked. Continue normal Gofer
work in the main session. Do not enable broad permissions to clear the block.
CLI, desktop and each operating system need their own evidence before release.

See Google's
[permission rules](https://antigravity.google/docs/cli/permissions/) and
[custom agent controls](https://antigravity.google/docs/subagents).

Copilot Chat must expose both Gofer Available Models and Gofer Read-Only Stage
Execution. Gofer lists current models before selecting an approved route. If
either tool is absent, it reports that once and retains the existing safe path.
Old logs and CLI results do not establish access in this chat. The installed
extension must contain the tested tools; a matching version label alone is not
proof. Agent-host and remote sessions need their own tool-access evidence.

Tests cover the instruction connection and shared engine across all 26 internal
stages for app and non-app work. Direct native bridge tests are separate from
testing whether each coding app follows `/eai` automatically. Neither proves
better quality, speed, or cost without a controlled comparison.

See the [preservation rubric](portable-orchestration-rubric.md) and
[execution contract](../.specify/references/portable-orchestration.md).
