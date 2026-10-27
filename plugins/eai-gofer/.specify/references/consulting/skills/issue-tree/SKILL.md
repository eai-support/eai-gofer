---
name: issue-tree
description: "Breaks a key question into a MECE logic tree of answerable sub-questions. Use after framing and before planning analyses."
---

# Issue Tree

Split one key question into a tree of sub-questions. Each leaf must be answerable by one analysis.

## Input

- One key question with scope (from `problem-framing`).

## Method

1. Choose the tree type: diagnostic ("Why is X happening?") or solution ("How could we achieve X?").
2. Choose one split logic per level, for example: profit = revenue - cost; revenue = price x volume; customer segments; process steps. Do not mix logics in one level.
3. Split each node into 2 to 5 branches. Go 3 to 4 levels deep.
4. Phrase every node as a question. The children must fully answer the parent.
5. Test each level for overlaps and gaps before going deeper.
6. Prune branches that cannot change the decision.

## Output

1. A numbered, indented outline (1, 1.1, 1.1.1).
2. A table: Leaf question | Why it matters | Data needed.
3. A note on the split logic used at each level.

## Quality bar

- Each level is mutually exclusive and collectively exhaustive.
- One split logic per level.
- Leaves are specific enough to assign to one analysis.

## Boundaries

- Not for hypotheses or the workplan per leaf: use `hypothesis-map`.
- Not for auditing a tree that already exists: use `mece-check`.
- Hand off to: `hypothesis-map`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
