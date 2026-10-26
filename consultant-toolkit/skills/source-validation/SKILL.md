---
name: source-validation
description: "Rates sources and claims for credibility, recency, method and bias, then decides use, caveat or exclude. Use before evidence enters an analysis."
---

# Source Validation

Decide which sources and claims are safe to use, and how to caveat the rest.

## Input

- A list of sources or claims: reports, articles, datasets, filings, web pages, internal documents.

## Method

1. Authority: who produced it, and do they have relevant expertise?
2. Method: is the method stated? Check sample size, definitions, and modeling choices.
3. Recency: is the data current for the question? Record the data date, not only the publish date.
4. Independence: who paid for it, and what incentive could bias it?
5. Corroboration: do two or more independent sources agree? Explain any differences.
6. Comparability for numbers: check definitions, units, currency, base year, and geography.
7. Rate each item High, Medium, or Low, and decide: Use, Use with caveat, or Exclude.

## Output

Source log table: # | Source (title, author, date, link) | Claim used | Authority | Method | Recency | Bias risk | Corroboration | Rating | Decision | Caveat text.

## Quality bar

- Every numeric claim has a traceable origin.
- Each caveat is written in words a reader can reuse in a footnote.

## Boundaries

- Not for summarizing what the sources say: use `research-synthesis`.
- Hand off to: `research-synthesis`, `competitor-benchmark`, `market-sizing`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
