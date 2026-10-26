---
name: data-visualization
description: "Builds a clean, accessible chart as code or a portable spec with correct encoding, scales and labels. Use to render a chosen chart."
---

# Data Visualization

Build the chart correctly, so it is honest, readable, and accessible.

## Input

- The data, the chart type (from `chart-selection`), and the message.

## Method

1. Apply the encoding from `chart-selection`. Sort categories by value unless order has meaning.
2. Scales: start bar axes at zero. A line axis may start above zero if it is labeled.
3. Label directly on the chart where possible instead of a legend.
4. Format numbers: units, thousands separators, consistent decimals, and currency.
5. Color: one accent for the focus (from `data-storytelling` emphasis notes if given) and neutral grey for the rest. Use a colorblind-safe palette.
6. Accessibility: text contrast of at least 4.5 to 1, and alt text that states the message and key values.
7. Remove chart junk: heavy gridlines, borders, shadows, and 3D.
8. Deliver in the best format available:
   - If code execution is available: write the plotting code, run it, and return the image and the code.
   - If not: return the data table, a one-paragraph description of the chart, and an optional Vega-Lite JSON spec that compatible tools can render.

## Output

1. The chart (image, code, or spec).
2. Alt text.
3. Data table used.

## Quality bar

- No distorted scales.
- A reader gets the message without the legend.

## Boundaries

- Not for choosing the chart type: use `chart-selection`.
- Not for titles, callouts, and sources: use `exhibit-builder`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
