---
name: survey-analysis
description: "Analyzes survey data: sample checks, weighting, cross-tabs, significance tests and coded open-ends. Use when results come from a questionnaire."
---

# Survey Analysis

Turn questionnaire responses into reliable, segment-level findings.

## Input

- Survey response data, the questionnaire, and the target population.

## Method

1. Check the sample: size, response rate, and fit to the target population. Note quotas.
2. Clean: remove speeders, straight-liners, duplicates, and invalid answers. Report what was removed.
3. Weight to the population when the sample is skewed. State the weighting variables.
4. Report descriptive results with base sizes (n) for every figure.
5. Cross-tab by key segments.
6. Test differences: chi-square for proportions, t-test for means. Flag bases under 30 as directional. Margin of error for a share p is about 1.96 x sqrt(p(1-p)/n).
7. Code open-ended answers into categories with counts.
8. If asked for drivers, use correlation or regression, and state that correlation is not causation.

## Output

1. Sample and cleaning summary.
2. Results tables with n, percentages, and significance flags.
3. Coded open-ends: Category | Count | Example.
4. Top findings as full sentences, with caveats.

## Quality bar

- Every percentage shows its base.
- Only significant differences are called differences.

## Boundaries

- Not for designing the questionnaire.
- Not for interviews or focus groups: use `interview-synthesis`.
- Not for building segments: use `customer-segmentation`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
