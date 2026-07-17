---
generated: true
generated_at: '2026-05-29T00:00:00.000Z'
source_commit: 'public-launch-readiness'
---

# Gofer - Changelog

This changelog tracks notable public-facing releases, packaging changes, and
documentation updates for Gofer.

## v3.7.24 - 2026-07-17

### Changed

- Updated public documentation to teach `/eai` as the single user-facing command
  for design, build, and validation work.
- Reframed numbered stage commands as internal pipeline contracts that Gofer
  routes automatically.
- Clarified that users should keep making business-language requests through
  `/eai`, `#eai`, or `$eai` depending on the host.

## v3.4.7 - 2026-05-29

### Changed

- Consolidated the core pipeline to internal contracts from Gofer Start through
  validation
- Removed the old standalone `6a_gofer_engineering_review` stage from the core
  public flow
- Updated public README, docs, plugin manifests, and release metadata to align
  with the current seven-stage pipeline
- Improved cross-host install guidance for VS Code, Claude Code, Codex, GitHub
  Copilot, and Gemini

### Fixed

- Cleaned public packaging metadata so generated marketplace/plugin manifests
  use generic Gofer branding instead of older internal naming
- Reduced stale public documentation references to legacy install and rollback
  commands

### Public Launch Work In Progress

- community files added: `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`,
  `CODE_OF_CONDUCT.md`
- GitHub Discussions, wiki, issues, and public repo metadata prepared
- remaining launch blockers are tracked separately, including open-source
  licensing and deeper legacy workflow cleanup

## v3.4.5 - 2026-05-28

### Changed

- Added workspace bootstrap helpers for plugin-hosted workflows
- Improved public install/update flows for Claude Code, Codex, Copilot, and
  Gemini

## v3.4.3 - 2026-05-22

### Changed

- Published shared public release artifacts for the VS Code extension and
  portable agent bundle
- Refreshed documentation for release distribution and generated command
  surfaces

## Release Notes Source

- GitHub Releases:
  [eai-tools/eai-gofer/releases](https://github.com/eai-tools/eai-gofer/releases)
- Public release site:
  [eai-tools.github.io/eai-gofer/releases](https://eai-tools.github.io/eai-gofer/releases)
