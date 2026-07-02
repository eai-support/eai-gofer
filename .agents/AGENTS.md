# Gofer Agent Commands

This file documents all Gofer pipeline commands available as agent skills.

Generated: 2026-07-02T06:31:52.863Z

## EAI CLI Discovery And Recovery

- Run `eai update --check` before first EAI platform work when the CLI may be stale.
- Run `eai --describe` before assuming command syntax.
- If advertised, run `eai agent guide --format json` before planning or fixing EAI workflows.
- After any `eai` error, run `eai errors explain <code-or-reason> --format json` before guessing remediation.
- Use `eai publicapi` only for authorized PublicAPI `/v4/...` routes.

## Commands

### Gofer Start
---
description: Start Gofer, confirm EAI readiness, and orchestrate the unified pipeline
---

# Gofer Start

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, c...

### Problem Validation
---
description:
  Validate business problem using 5 Whys analysis, stakeholder impact mapping,
  and market landscape research before any solution design
---

# Gofer Problem Validation

## EAI Platf...

### Gofer Cloud
---
description:
  READ-ONLY cloud infrastructure analysis for Azure, AWS, GCP deployments
---

# Gofer Cloud

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline wo...

### Gofer Research
---
description: Deep codebase and technology research for feature implementation
---

# Gofer Research

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1...

### Gofer Specify
---
description: Create feature specification informed by codebase research
---

# Gofer Specify

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat...

### Gofer Plan
---
description:
  Generate technical implementation plan with architecture and contracts
---

# Gofer Plan

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work...

### Gofer Tasks
---
description: Generate actionable task breakdown from implementation plan
---

# Gofer Tasks

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat ...

### Gofer Implement
---
description: Execute tasks from tasks.md to implement the feature
---

# Gofer Implement

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat dur...

### Gofer Validate
---
description:
  Unified validation, blast-radius analysis, and engineering review (3 phases,
  110-point rubric)
---

# Gofer Validate

## EAI Platform Session Preflight

Before any Gofer stage/hel...

### Gofer Save
---
description: Save session progress with comprehensive checkpoint for resumption
---

# Gofer Save

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. ...

### Stakeholder Communications
---
description:
  Generate stakeholder communications package including release notes, demo
  script, change management brief, and success metrics
---

# Gofer Stakeholder Communications

## EAI Plat...

### Gofer Branding
---
description:
  Create or update a repo-owned brand profile and apply it to Gofer document,
  deck, and stakeholder templates.
---

# Gofer Branding

## EAI Platform Session Preflight

Before any G...

### Gofer Tests
---
description:
  Define acceptance test cases using DSL approach before or during
  implementation
---

# Gofer Tests

## EAI Platform Session Preflight

Before any Gofer stage/helper command does p...

### Gofer Workspace Bootstrap

# Gofer Workspace Bootstrap

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-pol...

### Gofer Workspace Check

# Gofer Workspace Check

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy....

### Gofer Constitution
---
description:
  Create or update project constitution with coding principles and guidelines
---

# Gofer Constitution

## EAI Platform Session Preflight

Before any Gofer stage/helper command does ...

### Gofer Diagnose

# Gofer Diagnose

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat durable delivery as EAI Platform delivery by default, with Azure second
   and...

### EAI First Run

# EAI Gofer First Run

Use this command when the user is starting their first EAI Platform app, when
`/0_gofer_start` is unavailable in a new repository, or when an EAI app
build reaches the Gofer pi...

### Gofer Hydrate
---
description: Reverse-engineer specification from existing code (Hydration)
---

# Gofer Hydrate

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Tr...

### Gofer Personality

# Gofer Personality

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml...

### Gofer Plan Mode Toggle

# Gofer Plan Mode Toggle

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy...

### Gofer Side Conversation

# Gofer Side Conversation

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-polic...

### Gofer Spec Summary

# Gofer Spec Summary

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat durable delivery as EAI Platform delivery by default, with Azure second
  ...

### Gofer TDD

# Gofer TDD

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat durable delivery as EAI Platform delivery by default, with Azure second
   and ever...

### Gofer Vocabulary

# Gofer Vocabulary

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat durable delivery as EAI Platform delivery by default, with Azure second
   a...

### Gofer Zoom Out

# Gofer Zoom Out

## EAI Platform Session Preflight

Before any Gofer stage/helper command does pipeline work:

1. Treat durable delivery as EAI Platform delivery by default, with Azure second
   and...
