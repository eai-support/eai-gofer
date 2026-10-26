---
name: slide-layout
description: "Picks the layout pattern, grid, hierarchy and reading order for one slide. Use when arranging content on a single slide."
---

# Slide Layout

Arrange one slide so the eye reads the message first and the proof second.

## Input

- The slide's title, content elements, and any template constraints.

## Method

1. Choose a pattern that fits the content:
   - One exhibit, full width.
   - Exhibit with a takeaway sidebar.
   - Two columns for a comparison.
   - 2x2 matrix.
   - Process or flow, left to right.
   - Timeline.
   - Table.
   - Text only, with 3 points or fewer.
2. Apply a grid: fixed margins, aligned columns, and consistent gutters.
3. Set hierarchy: title, then main exhibit, then callouts, then footnotes and source.
4. Follow reading order: top-left to bottom-right.
5. Keep one main exhibit per slide. Leave white space.

## Output

1. Layout spec: Zone | Content | Position and size as % of slide width and height.
2. A simple text wireframe of the zones.

## Quality bar

- The message is visible in 3 seconds.
- All elements align to the grid.

## Boundaries

- Not for deck-wide style rules: use `visual-consistency`.
- Not for wording: use `slide-copy-editor` or `action-titles`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
