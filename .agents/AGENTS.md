# Gofer Agent Commands

This file documents all Gofer pipeline commands available as agent skills.

Generated: 2026-06-28T00:11:01.636Z

## EAI CLI Discovery And Recovery

- Run `eai update --check` before first EAI platform work when the CLI may be
  stale.
- Run `eai --describe` before assuming command syntax.
- If advertised, run `eai agent guide --format json` before planning or fixing
  EAI workflows.
- After any `eai` error, run `eai errors explain <code-or-reason> --format json`
  before guessing remediation.
- Use `eai publicapi` only for authorized PublicAPI `/v4/...` routes.

## Commands

### Business Scenario

---

## description: Triage business scenario and orchestrate the unified Gofer pipeline

# Gofer Orchestrator

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents,...

### Problem Validation

---

description: Validate business problem using 5 Whys analysis, stakeholder impact
mapping, and market landscape research before any solution design

---

# Gofer Problem Validation

## Token And...

### Gofer Cloud

---

description: READ-ONLY cloud infrastructure analysis for Azure, AWS, GCP
deployments

---

# Gofer Cloud

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, ...

### Gofer Research

---

## description: Deep codebase and technology research for feature implementation

# Gofer Research

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, callin...

### Gofer Specify

---

## description: Create feature specification informed by codebase research

# Gofer Specify

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools...

### Gofer Plan

---

description: Generate technical implementation plan with architecture and
contracts

---

# Gofer Plan

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, ca...

### Gofer Tasks

---

## description: Generate actionable task breakdown from implementation plan

# Gofer Tasks

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools,...

### Gofer Implement

---

## description: Execute tasks from tasks.md to implement the feature

# Gofer Implement

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or...

### Gofer Validate

---

description: Unified validation, blast-radius analysis, and engineering review
(3 phases, 110-point rubric)

---

# Gofer Validate

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -...

### Gofer Save
---
description: Save session progress with comprehensive checkpoint for resumption
---

# Gofer Save

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling ...

### Stakeholder Communications

---

description: Generate stakeholder communications package including release
notes, demo script, change management brief, and success metrics

---

# Gofer Stakeholder Communications

## Token An...

### Gofer Resume

---

description: Resume work from saved session checkpoint with full context
restoration

---

# Gofer Resume

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents,...

### Gofer Tests

---

description: Define acceptance test cases using DSL approach before or during
implementation

---

# Gofer Tests

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawnin...

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

description: Create or update project constitution with coding principles and
guidelines

---

# Gofer Constitution

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawni...

### Gofer Diagnose

# Gofer Diagnose

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml` a...

### EAI First Run

# EAI Gofer First Run

Use this command when the user is starting their first EAI Platform app, when
`/0_business_scenario` is unavailable in a new repository, or when an EAI app
build reaches the Go...

### Gofer Hydrate

---

## description: Reverse-engineer specification from existing code (Hydration)

# Gofer Hydrate

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling to...

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

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yam...

### Gofer TDD

# Gofer TDD

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml` as the...

### Gofer Vocabulary

# Gofer Vocabulary

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml`...

### Gofer Zoom Out

# Gofer Zoom Out

## Token And Cost Policy

<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml` a...
