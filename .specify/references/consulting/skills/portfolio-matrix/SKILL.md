---
name: portfolio-matrix
description: "Places existing units on a growth-share or nine-box matrix with invest, hold or exit roles. Use for portfolio allocation."
---

# Portfolio Matrix

Decide how to allocate resources across existing business units or product lines.

## Input

- A list of units or products with revenue, profit, market growth, and market share data.

## Method

1. Choose the matrix:
   - Growth-share (BCG): market growth vs. relative market share. Quadrants: stars, cash cows, question marks, dogs.
   - Nine-box (GE-McKinsey): industry attractiveness vs. business strength, each a weighted score of stated factors.
2. Compute axis values for each unit and state the method and weights.
3. Place each unit. Size each bubble by revenue.
4. Assign a role: invest to grow, hold, harvest, or divest.
5. Check portfolio balance: do cash generators fund growth units?

## Output

1. Table: Unit | X value | Y value | Revenue | Position | Role | Rationale.
2. Portfolio balance note and top reallocation moves.
3. Chart data ready for `data-visualization`.

## Quality bar

- Axis definitions and thresholds are stated.
- Roles follow from position and strategy, not from history.

## Boundaries

- Not for finding new growth avenues: use `growth-strategy`.
- Not for drawing the chart: use `data-visualization`.
- Not for ranking AI uses: use `ai-opportunity-scan`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
