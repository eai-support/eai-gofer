---
name: sensitivity-analysis
description: "Flexes key drivers one or two at a time to rank impact and find where the decision flips. Use to stress-test a case."
---

# Sensitivity Analysis

Find which assumptions move the answer most, and where the answer flips.

## Input

- A model or case with an output metric (for example NPV, EBIT, or payback) and its drivers.

## Method

1. List the drivers of the output metric.
2. Set a realistic low and high value for each driver from history, benchmarks, or expert range. Do not use a flat plus or minus 10% unless no better range exists.
3. Flex one driver at a time. Record the change in output.
4. Rank drivers by output swing (tornado).
5. For the top two drivers, build a two-way table.
6. Find thresholds, for example: "NPV turns negative if price falls below X."
7. Flag drivers that move together. Send those to `scenario-analysis`.

## Output

1. Tornado table: Driver | Low value | High value | Output at low | Output at high | Swing | Rank.
2. Two-way table for the top two drivers.
3. Threshold table and a one-paragraph insight.

## Quality bar

- Ranges are justified, not arbitrary.
- Thresholds are stated in business terms.

## Boundaries

- Not for coherent multi-driver futures: use `scenario-analysis`.
- Not for building the model: use `financial-model`.
- Not for the base breakeven volume of a unit: use `unit-economics`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
