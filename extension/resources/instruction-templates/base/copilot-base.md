# Copilot Instructions

## Project Overview

{{projectOverview}}

## Gofer Pipeline

{{availableCommands}}

## Code Quality

{{codeQuality}}

## Task Management

1. **Plan First**: Write plan with checkable items before starting
2. **Track Progress**: Mark items complete as you go
3. **Verify**: Run tests and demonstrate correctness before marking done
4. **Capture Lessons**: Update lessons file after corrections

## Issue and pull request titles

Say what changes, who or what benefits, and the outcome or risk it addresses.

Keep titles concise and in business language. Use a prefix such as `CURATE:` only when it helps identify a programme. The prefix should not replace the outcome.

An issue describes the outcome needed:

`Prevent [risk] for [user or system] by [needed capability]`

Example from Issues2025 #3375: Prevent broken EAI app data links caused by inconsistent Object Type slugs.

A pull request describes the change delivered and the outcome it enables:

`Enable [outcome] for [user or system] by [change made]`

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
