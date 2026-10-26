---
name: customer-segmentation
description: "Defines needs- or behavior-based customer segments with size, value and priority. Use to decide which customers to target."
---

# Customer Segmentation

Group customers into segments that need different offers, and choose which to target.

## Input

- Customer data (CRM, transactions, survey results) or qualitative research, plus the business goal.

## Method

1. Choose a basis that predicts behavior: needs, behaviors, or value. Use demographics only if they predict behavior.
2. Choose a method: rules from research (a priori), or clustering when data allows. State the method.
3. Aim for 4 to 7 segments. Give each a descriptive name.
4. Profile each segment: size, revenue or profit, growth, needs, behaviors, channels, and pain points.
5. Test each segment: measurable, substantial, accessible, differentiated, actionable.
6. Rank segments by attractiveness and ability to win.

## Output

1. Segment profile table: Segment | Size | Value | Growth | Needs | Behaviors | Channels | Test result.
2. Targeting recommendation with reasons.

## Quality bar

- Each customer belongs to exactly one segment.
- Segments differ in what they need, not only in who they are.

## Boundaries

- Not for total market size: use `market-sizing`.
- Not for setting prices per segment: use `pricing-strategy`.
- Not for auditing an existing segmentation: use `mece-check`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
