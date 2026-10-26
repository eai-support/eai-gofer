---
name: kpi-dashboard
description: "Designs a KPI tree and dashboard spec with definitions, formulas, targets, owners, cadence and layout. Use to track performance or benefits."
---

# KPI Dashboard

Define what to measure, how, and how to show it, so leaders can steer.

## Input

- The objectives to track, the audience, and the available data sources.

## Method

1. Build a KPI tree: outcome KPI at the top, then driver KPIs, then operational metrics.
2. Pick 5 to 9 KPIs for the audience. Mix leading and lagging indicators.
3. Define each KPI: name, definition, formula, unit, data source, frequency, owner, baseline, target, and red, amber, and green thresholds.
4. Design the layout: headline KPIs on top, trends in the middle, drill-downs below.
5. Set alerts and the review cadence: who reviews, when, and what decisions follow.

## Output

1. KPI tree (indented list).
2. KPI dictionary table with the fields in step 3.
3. Dashboard wireframe: Zone | KPIs | Visual type.

## Quality bar

- Every KPI has one owner, one formula, and one source.
- Each KPI links to an objective in the tree.

## Boundaries

- Not for drawing the charts: use `data-visualization`.
- Not for valuing benefits: use `business-case`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
