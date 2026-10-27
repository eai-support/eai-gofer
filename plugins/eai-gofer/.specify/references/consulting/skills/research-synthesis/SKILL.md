---
name: research-synthesis
description: "Synthesizes desk research such as reports, articles and filings into sourced findings. Use for secondary research."
---

# Research Synthesis

Turn a pile of secondary sources into clear, sourced findings that answer specific questions.

## Input

- Secondary sources (ideally rated by `source-validation`) and the questions to answer (from `issue-tree` or `hypothesis-map`).

## Method

1. List the questions. Map each source to the questions it informs.
2. Extract facts with a citation for each fact.
3. Cluster facts by question, then by theme.
4. Reconcile conflicts: explain differences in definitions, dates, or methods. Do not average them away.
5. Write one finding per cluster as a full sentence.
6. Rate confidence (High, Medium, Low) from source quality and agreement.
7. List gaps: questions the sources do not answer.

## Output

1. Findings table: Question | Finding | Key evidence | Sources | Confidence.
2. Conflicts and how they were resolved.
3. Gaps and suggested ways to close them.

## Quality bar

- Every finding cites at least one source.
- Findings state facts, not recommendations.

## Boundaries

- Not for rating source credibility: use `source-validation` first.
- Not for interview notes: use `interview-synthesis`. Not for questionnaire data: use `survey-analysis`.
- Not for cross-workstream conclusions: use `insight-synthesis`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
