---
name: raci-builder
description: "Builds a RACI matrix of activities or decisions by role, one Accountable per row. Use to clarify who does and approves each item."
---

# RACI Builder

Make clear who does, owns, advises on, and hears about each activity or decision.

## Input

- A list of activities or decisions, and the roles involved.

## Method

1. Write rows as verb-noun activities or decisions, for example "Approve budget".
2. Use roles as columns, not names of people.
3. Assign codes:
   - R (Responsible): does the work.
   - A (Accountable): owns the outcome and gives final approval.
   - C (Consulted): gives input before the work; two-way.
   - I (Informed): told after; one-way.
4. Check every row: exactly one A, at least one R. A and R can be the same role.
5. Check every column: no role is overloaded with A. Remove roles that have no letter in any row.
6. Limit C to people whose input changes the result.

## Output

1. RACI matrix.
2. Check results: rows without one A, rows without R, overloaded roles, and fixes.

## Quality bar

- Exactly one A per row.
- Every role in the matrix has a reason to be there.

## Boundaries

- Not for organization structure and forums: use `operating-model`.
- Not for stakeholder engagement: use `stakeholder-map`.
- Not for who may see or change records: use `business-object-map`.
- Not for owners of compliance obligations: use `compliance-obligation-map`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
