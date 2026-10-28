---
name: pestel-scan
description: "Scans political, economic, social, technological, environmental and legal trends by impact. Use for macro-environment analysis."
---

# PESTEL Scan

Find the macro trends that will help or hurt the business, and rank them.

## Input

- The business, its markets and geographies, and the time horizon.

## Method

1. For each factor (Political, Economic, Social, Technological, Environmental, Legal), list 2 to 4 trends that matter to this business.
2. Give evidence for each trend, with a source.
3. Rate direction (helps or hurts), likelihood, impact (High, Medium, Low), and timing (0-2, 2-5, 5+ years).
4. Write the implication for the business in one sentence.
5. Rank trends by impact x likelihood. Keep the top 5 to 8.

## Output

1. Table: Factor | Trend | Evidence and source | Direction | Likelihood | Impact | Timing | Implication.
2. Top trends, ranked, with a one-line reason each.

## Quality bar

- Trends are specific to this business, not generic headlines.
- Each trend has evidence and a dated source.

## Boundaries

- Not for industry structure or rivalry: use `five-forces`.
- Not for company-level competitor facts: use `competitor-benchmark`.
- Not for AI's effect on profit pools: use `ai-disruption-assessment`.
- Not for the obligations one process must meet: use `compliance-obligation-map`.
- Hand off to: `swot-analysis` (opportunities and threats), `scenario-analysis` (key uncertainties).

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
