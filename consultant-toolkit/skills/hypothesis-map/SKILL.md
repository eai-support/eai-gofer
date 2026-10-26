---
name: hypothesis-map
description: "Assigns a testable hypothesis, analysis, data source and priority to each issue-tree branch. Use to build a hypothesis-driven workplan."
---

# Hypothesis Map

Turn an issue tree into a hypothesis-driven workplan, so the team tests a likely answer instead of boiling the ocean.

## Input

- An issue tree (from `issue-tree`) and any early facts.

## Method

1. Write a "day one answer": the most likely answer to the key question.
2. For each leaf, write one hypothesis as a falsifiable statement. Example: "Churn rose because the 2024 price change hit small accounts."
3. Write what would disprove it (the kill criterion).
4. Name the analysis that tests it and the data source.
5. Rate priority by impact on the answer and ease of testing (High, Medium, Low).
6. Assign an owner and a due date.
7. Sequence high-impact, easy tests first.

## Output

1. Day one answer (one or two sentences).
2. Workplan table: # | Hypothesis | Disproved if | Analysis | Data source | Priority | Owner | Due.

## Quality bar

- Every hypothesis can be proven wrong.
- Every hypothesis maps to one analysis and one data source.
- The plan starts with the tests that most change the answer.

## Boundaries

- Not for building the tree: use `issue-tree`.
- Not for running the analyses: use the analysis skills, for example `market-sizing` or `unit-economics`.
- Hand off to: `insight-synthesis` after tests return.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
