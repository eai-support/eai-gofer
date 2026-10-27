---
name: insight-synthesis
description: "Combines findings across workstreams into ranked so-what insights and one answer. Use to form a point of view."
---

# Insight Synthesis

Turn findings from many analyses into a short, ranked set of insights and one answer.

## Input

- Findings from `research-synthesis`, `interview-synthesis`, `survey-analysis`, and the analysis skills, plus the key question and hypotheses. Run the per-source skills on raw material first.

## Method

1. Collect all findings in one list, with their source analysis.
2. For each candidate insight, write three parts: observation (what we see), implication (so what), action (now what).
3. Triangulate: keep an insight only if two or more independent findings support it, or label it as single-source.
4. Resolve contradictions. Explain which evidence wins and why.
5. Mark each hypothesis as confirmed, refuted, or open.
6. Rank insights by impact on the key question.
7. Write the answer to the key question in one sentence.

## Output

1. The answer (one sentence).
2. Insight table: Rank | Observation | Implication | Action | Supporting findings | Confidence.
3. Hypothesis status table.

## Quality bar

- An insight says something a fact alone does not.
- Every insight traces to evidence.

## Boundaries

- Not for synthesizing one source type: use `research-synthesis`, `interview-synthesis`, or `survey-analysis`.
- Not for arranging the argument: use `pyramid-structure`.
- Not for narrating one analysis: use `data-storytelling`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
