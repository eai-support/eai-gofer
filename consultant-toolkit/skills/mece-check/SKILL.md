---
name: mece-check
description: "Audits any list, tree, segmentation or framework for overlaps, gaps and mixed logic, then proposes fixes. Use to test a structure before use."
---

# MECE Check

Test a structure for Mutually Exclusive and Collectively Exhaustive logic, and fix it.

## Input

- Any structure: a list, issue tree, pyramid, segmentation, set of options, or slide sections.

## Method

1. Name the parent: what the set must fully cover.
2. Name the split dimension of each level.
3. Exclusive test: for each pair, can one item belong to both? If yes, record an overlap.
4. Exhaustive test: does the set fully cover the parent? If an "other" bucket would be large, record a gap.
5. Level test: are all items at the same level of detail?
6. Dimension test: does one level mix two logics, such as region and product?
7. Phrasing test: are items parallel in form?
8. Propose the smallest change that fixes each issue.

## Output

1. Verdict: MECE, Minor issues, or Not MECE.
2. Issue table: Item | Issue (overlap, gap, level, mixed logic, phrasing) | Evidence | Fix.
3. The revised structure.

## Quality bar

- Every issue cites the items involved.
- Fixes keep the original intent.

## Boundaries

- Not for building a new structure from nothing: use `issue-tree`, `pyramid-structure`, or `customer-segmentation`.
- Not for a full deck review: use `deck-quality-check`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
