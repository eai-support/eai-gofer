---
generated: true
generated_at: "2026-09-21T22:04:18.799Z"
source_commit: "a472e0f9103c75b5a5139db178f343e70efb8a03"
---
# Gofer Data Model

## Storage Summary

Gofer has no database, hosted persistence, or migrations. It stores
human-readable Markdown, JSON, and JSONL in the workspace `.specify/`
directory. Git history is the primary recovery mechanism.

```mermaid
erDiagram
    SPEC ||--o{ TASK : contains
    SPEC ||--o| RESEARCH : has
    SPEC ||--o| PLAN : has
    SPEC ||--o| VALIDATION : produces
    SPEC ||--o| CHECKPOINT : resumes
    TASK ||--o{ TASK : depends_on
    MEMORY ||--o{ OBSERVATION : relates_to
    MEMORY ||--o{ LOG_ENTRY : referenced_by
    SPEC {
      string id PK
      string status
      string branch
      yaml frontmatter
      markdown body
    }
    TASK {
      string id PK
      string spec_id FK
      enum status
      string[] dependencies
      string[] files
    }
    RESEARCH {
      string spec_id FK
      markdown content
      json chunk index
    }
    PLAN {
      string spec_id FK
      markdown content
    }
    VALIDATION {
      string spec_id FK
      markdown or json result
    }
    CHECKPOINT {
      string spec_id FK
      json session state
    }
    MEMORY {
      string id PK
      enum layer
      json or jsonl content
    }
    OBSERVATION {
      uuid id PK
      boolean masked
      string summary
    }
    LOG_ENTRY {
      datetime timestamp
      string event_type
      json payload
    }
```

## Repository Layout and Fields

| Location | Record/content | Key fields or constraints |
| --- | --- | --- |
| `.specify/specs/{id}/spec.md` | Feature specification | YAML frontmatter and Markdown requirements/acceptance content |
| `.specify/specs/{id}/tasks.md` | Task list | IDs such as `T001`; statuses include `pending`, `in_progress`, `testing`, `completed`, `failed`, `blocked`; dependency ordering |
| `.specify/specs/{id}/research.md`, `plan.md`, `data-model.md`, `contracts.md` | Stage artifacts | Feature-scoped Markdown |
| `.specify/specs/{id}/validation/` | Validation outputs | Stage-specific evidence |
| `.specify/specs/{id}/checkpoint.json` | Resume state | JSON checkpoint |
| `.specify/memory/` | Constitution, model policy, flat/layered memories, context state, observation cache, knowledge graph | Optional layered memory: `core`, `recall`, `archival` |
| `.specify/logs/` | Audit, usage, slop, and run-ledger events | Append-only JSONL where enabled |
| `.specify/current-stage.json` and `.specify/ipc/status.json` | Pipeline/orchestrator state | JSON state files |

## Indexes, Constraints, and Migration

- Research chunks are indexed by spec and chunk ID.
- Observations use UUID lookup through the observation cache.
- Memory search uses an in-memory TF-IDF index where enabled.
- The language-server spec cache is in memory and invalidated by file changes.
- Path access is constrained by `WorkspaceAccess` and artifact allowlists.
- `gofer.upgrade` and `gofer.fixSpecPaths` support legacy spec layout migration.
- `gofer.migrateMemoriesToLayered` migrates the deprecated flat memory store.
- No SQL/NoSQL tables, foreign-key database constraints, or schema migration
  runner were found.
