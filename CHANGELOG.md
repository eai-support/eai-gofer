# Changelog

All notable changes to the Gofer VSCode extension will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- Trimmed the root and extension READMEs plus the VS Code configuration guide to
  the current manifest-backed command and settings surface.
- Removed the outdated migration and WhatsApp guides that still described dead
  VS Code commands, notification flows, and setup paths.

### Added

- **CLI Innovations + Multi-Persona Visual Artifacts** (feature
  001-cli-innovations-visuals):
  - Source-of-truth generator at `.specify/scripts/node/generate-commands.mjs` —
    single canonical file per stage at `.specify/commands/<stage>.md` emits to 8
    CLI surfaces (Claude, Claude-mirror, Copilot, VSCode, Codex, Gemini, GitHub
    Prompts, system-skills).
  - Persona-pack visual templates: Impact Canvas, C4 Context/Container,
    AS-IS/TO-BE Value Streams, Capability Heatmap, Bounded-Context Map,
    Data-Model ERD, Risk Heatmap, ROI Projection (10 templates).
  - 7 visual-writer sub-agents: visual-canvas-writer, visual-c4-writer,
    visual-bounded-context-writer, visual-erd-writer, visual-heatmap-writer,
    visual-risk-writer, visual-value-stream-writer.
  - `/gofer:*` namespace aliases for the full pipeline/helper command surface
    plus 3 new control commands: `/gofer:plan` (plan-mode toggle), `/gofer:side`
    (side-channel), `/gofer:personality` (tone preset).
  - `gofer codex doctor` — read-only Codex skill-budget diagnostic.
  - Plugin manifests: `.claude-plugin/plugin.json`, `.gemini/extension.json`,
    root `AGENTS.md`, `codex-config.toml` scaffold.
  - Two-pass canvas: pass 1 in `/2_gofer_specify` (heuristic risks), pass 2 in
    `/6_gofer_validate` (replaces topThreeRisks slot only).
  - `gofer:generate`, `gofer:codex-doctor`, `gofer:mermaid-export` npm scripts
    wired into root `package.json`.

### Fixed

- Codex skill-budget incident (2026-04-25): 176 redundant skill bundles disabled
  via `[[skills.config]] enabled = false` in `~/.codex/config.toml`.

### Documentation

- ADR-003: `/gofer:plan` namespace split (plan-mode toggle vs
  `/gofer:plan-stage`).
- ADR-004: Plugin marketplace destination.
- ADR-005: `mmdc` vs GitHub Action rendering target.
- Constitution updated to document `.agents/skills/` as the Codex discovery
  target and the source-of-truth approach.
- `.specify/memory/lessons.md` with Codex skill-budget incident lessons.

- **Memory Panel Usability Fix** (feature 001): Filter system telemetry from
  user memories
  - New toggle control to show/hide system-generated memories (auto_decision,
    discovery)
  - Category and tag dropdowns now filter based on toggle state
  - Default view excludes #auto tagged memories (533 system entries → 0 visible
    by default)
  - Search results respect filter state
  - UI-level filtering preserves all data without storage migration
  - 100% test coverage with 0% mock ratio (11 feature tests: 4 unit, 3
    integration, 4 UI)

- **Cross-Platform Command Parity** (feature 028): All core Gofer stage files
  now available across Claude Code, GitHub Copilot Chat, and OpenAI Codex CLI
  - New `gofer.defaultCLI` setting to choose preferred AI platform (`claude`,
    `copilot`, `codex`, or `auto`)
  - Automatic command routing to `.claude/commands/`, `.github/prompts/`, or
    `.system/skills/` based on selected platform
  - Command generation script creates Codex skills and Copilot prompts from
    Claude command templates
  - Parallel agent spawning for validation stage (<60s vs 90-120s sequential)
  - Conversation history preservation when switching between providers
  - Comprehensive platform capabilities documentation with setup guides

**New Commands Available on All Platforms:**

- `/0_gofer_start` - Main orchestrator (full pipeline)
- `/0a_problem_validation` - Validate business problem
- `/1_gofer_research` - Codebase + technology research
- `/2_gofer_specify` - Create feature specification
- `/3_gofer_plan` - Generate implementation plan
- `/4_gofer_tasks` - Create task breakdown
- `/5_gofer_implement` - Execute tasks autonomously
- `/6_gofer_validate` - Validate with 6 parallel agents
- `/7_gofer_save` - Save session checkpoint
- `/7a_stakeholder_comms` - Generate stakeholder communications
- `/8_gofer_branding` - Brand templates and stakeholder documents
- `/9_gofer_tests` - Define acceptance test cases
- `/10_gofer_cloud` - Cloud infrastructure analysis
- `/gofer_constitution` - Create project coding principles
- `/gofer_hydrate` - Reverse-engineer spec from code

**Platform-Specific Features:**

- MCP server integration: Claude Code only
- Parallel validation agents: Claude Code (Task tool), Codex CLI (terminal
  multiplexing), Copilot 2026+ (multi-agent delegation)
- Autonomous mode: Claude Code and Codex CLI only
- Auto-chaining pipeline: All platforms (manual in pre-2026 Copilot)

**Documentation:**

- [Setup Guide: Claude Code](docs/setup-claude-code.md) - Full feature support
  with MCP tools
- [Setup Guide: GitHub Copilot Chat](docs/setup-copilot-chat.md) - Core
  features + 2026+ enhancements
- [Setup Guide: OpenAI Codex CLI](docs/setup-codex-cli.md) - Full feature
  support via skill system
- Platform capabilities comparison matrix in README

### Fixed

- AI token cost calculation bug fixes (feature 025-ai-usage-tracking)
