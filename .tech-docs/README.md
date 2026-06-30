---
generated: true
generated_at: '2026-05-29T10:00:00.000Z'
source_commit: 'public-launch-readiness'
---

# EAI Gofer

EAI Gofer is a business specification-driven delivery workflow for repositories.
It provides a shared `0-6` pipeline, repo-owned artifacts in `.specify/`, a VS
Code extension, and portable plugin surfaces for Claude Code, Codex, GitHub
Copilot, and Gemini.

## Core Pipeline

| Stage             | Command                | Purpose                                                      |
| ----------------- | ---------------------- | ------------------------------------------------------------ |
| Business Scenario | `/0_business_scenario` | Kick off the workflow, gather context, and route the work    |
| Research          | `/1_gofer_research`    | Explore the codebase, constraints, and delivery options      |
| Specify           | `/2_gofer_specify`     | Write the feature specification                              |
| Plan              | `/3_gofer_plan`        | Produce architecture, data model, and contracts              |
| Tasks             | `/4_gofer_tasks`       | Break the work into dependency-ordered execution units       |
| Implement         | `/5_gofer_implement`   | Make code and documentation changes                          |
| Validate          | `/6_gofer_validate`    | Run validation, blast-radius review, and final quality gates |

Optional helpers:

- `/0a_problem_validation`
- `/7_gofer_save`
- `/8_gofer_branding`
- `/9_gofer_tests`
- `/7a_stakeholder_comms`
- `/gofer:check-workspace`
- `/gofer:bootstrap-workspace`

## Release Feed

- Docs and downloads:
  [eai-tools.github.io/eai-gofer](https://eai-tools.github.io/eai-gofer/)
- Releases page:
  [eai-tools.github.io/eai-gofer/releases](https://eai-tools.github.io/eai-gofer/releases)
- Release feed: `https://eai-tools.github.io/eai-gofer/releases.json`

## Start Here

- [Overview](overview.md)
- [First Run In Five Minutes](first-run.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [API Reference](api-reference.md)
- [Documentation Surfaces](documentation-surfaces.md)

## Install Surfaces

| Surface            | Recommended source                       |
| ------------------ | ---------------------------------------- |
| VS Code            | Marketplace first, VSIX as fallback      |
| Claude Code        | `eai-tools/eai-gofer` GitHub marketplace |
| Codex              | GitHub repo marketplace                  |
| GitHub Copilot CLI | GitHub repo marketplace                  |
| Gemini CLI         | GitHub repo install with `--auto-update` |

## Model And Cost Policy

Bootstrap creates a user-owned model policy at
`.specify/memory/gofer-model-policy.yaml` from the shipped
`.specify/templates/gofer-model-policy.yaml` template. Edit the memory copy to
tune simple, medium, hard, and arbiter routes across Claude, Codex/OpenAI,
Gemini, and Copilot. Copilot uses `Auto` for simple/default work by default
because exact model availability depends on client, plan, and organization
policy.

## Community

- Discussions:
  [github.com/eai-tools/eai-gofer/discussions](https://github.com/eai-tools/eai-gofer/discussions)
- Issues:
  [github.com/eai-tools/eai-gofer/issues](https://github.com/eai-tools/eai-gofer/issues)
- Wiki:
  [github.com/eai-tools/eai-gofer/wiki](https://github.com/eai-tools/eai-gofer/wiki)
- Contributing:
  [CONTRIBUTING.md](https://github.com/eai-tools/eai-gofer/blob/main/CONTRIBUTING.md)
- Security:
  [SECURITY.md](https://github.com/eai-tools/eai-gofer/blob/main/SECURITY.md)

## References

- [GitHub Spec Kit docs](https://github.github.com/spec-kit/index.html)
- [github/spec-kit](https://github.com/github/spec-kit)
- [GitHub repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [GitHub Discussions quickstart](https://docs.github.com/discussions/quickstart)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Gemini CLI extensions reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md)
- [VS Code publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## Public Launch Notes

This documentation set is being cleaned up for a public launch. Community health
files, GitHub Discussions, contributor routing, and public install paths are now
first-class. Remaining legacy enterprise-profile internals are tracked
separately as follow-up launch work.
