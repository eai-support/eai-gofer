---
name: exhibit-builder
description: "Builds a full exhibit from a chart or table: callouts, units, legend, source and footnotes. Use to make a chart slide-ready."
---

# Exhibit Builder

Assemble a chart or table into a finished exhibit that proves its headline on its own.

## Input

- The chart or table (from `data-visualization`), the headline (from `action-titles`), and source details.

## Method

1. Place the headline. It states the message the exhibit proves.
2. Add a subtitle: what is measured, units, time frame, and scope.
3. Place the chart or table as the main element.
4. Add up to 3 callouts tied to the message, for example "+12 pts vs. 2023".
5. Keep the labels from `data-visualization`. Add only text elements: headline, subtitle, callouts, takeaway, footnotes, and source.
6. Add an optional takeaway box with one sentence.
7. Add footnotes for definitions, exclusions, and method.
8. Add a source line, for example: "Source: Company filings 2024; team analysis".
9. Check: does the exhibit prove the headline? Do the numbers match the model? Is there one message only?

## Output

Exhibit spec: Element | Exact text or content. Include a rendered version when tools allow.

## Quality bar

- Headline, callouts, and data agree.
- Every exhibit has a source line.

## Boundaries

- Not for headline wording: use `action-titles`.
- Not for drawing the chart: use `data-visualization`.
- Not for slide arrangement: use `slide-layout`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
