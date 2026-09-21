---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Documentation Surfaces

## Standard Source Of Truth

The central nightly `tech-docs` process treats `.tech-docs/` as the canonical generated snapshot for this repository.

| Path | Role | Central nightly aggregation |
|---|---|---|
| `.tech-docs/` | Generated technical snapshot derived from code and repo metadata | Yes |

## Additional Repo-Local Documentation Surfaces

| Path | Role | Central nightly aggregation |
|---|---|---|
| `docs/` | Published or authored docs tree | No; should be summarized into `.tech-docs/` |
| `docs-site/` | Docs-site framework project | No; should be summarized into `.tech-docs/` |

## Documentation Workflows

| Workflow | Triggers | Purpose |
|---|---|---|
| `.github/workflows/pages.yml` | push, manual | Repo-local docs publishing or pages deployment |

## Consolidation Status

- Repo: `tech-docs`
- Canonical nightly-generated surface: `.tech-docs/`
- Additional surfaces detected: 2
- Additional docs workflows detected: 1
