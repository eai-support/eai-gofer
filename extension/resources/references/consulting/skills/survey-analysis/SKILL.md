---
name: survey-analysis
description: "Analyzes survey data: sample checks, weighting, cross-tabs, significance and open-ends. Use when results come from a questionnaire."
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
6. Test differences: chi-square for proportions, t-test for means. Flag bases under 30 as directional. At 95% confidence, a simple random sample has a margin of error of about 1.96 x sqrt(p(1-p)/n) for a share p. With weights, use effective n = sum(w)^2 / sum(w^2). Flag results when you run many tests.
7. Without code execution, report descriptive results only and mark tests as not run.
8. Code open-ended answers into categories with counts.
9. If asked for drivers, use correlation or regression, and state that correlation is not causation.

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
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
