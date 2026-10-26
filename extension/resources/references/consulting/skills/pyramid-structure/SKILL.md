---
name: pyramid-structure
description: "Structures an argument as a Minto pyramid: governing thought, MECE key lines, then support. Use to organize the logic of a recommendation."
---

# Pyramid Structure

Arrange the argument top-down, so the answer comes first and every point supports the one above it.

## Input

- The answer (from `insight-synthesis`) and the supporting findings.

## Method

1. Put the governing thought at the top: the answer from `insight-synthesis`, worded for this audience.
2. Ask the question the governing thought raises (why, how, or what).
3. Answer it with 3 to 5 key lines. Prefer an inductive group (parallel reasons). Use a deductive chain only when the logic must build step by step.
4. Under each key line, add 2 to 4 supporting points with evidence.
5. Vertical check: each level answers the question the level above raises.
6. Horizontal check: each group is MECE, of the same kind, and in a deliberate order (time, structure, or importance).
7. Each key line must be a summary statement, not a topic label.

## Output

1. Indented pyramid: governing thought, key lines, support with evidence.
2. Logic check: vertical and horizontal results, and fixes made.

## Quality bar

- Reading only the key lines proves the governing thought.
- No key line overlaps another.

## Boundaries

- Not for the opening: use `scqa-storyline`.
- Not for a stand-alone structure audit: use `mece-check`.
- Hand off to: `recommendation-deck`, `executive-summary`, `decision-memo`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
