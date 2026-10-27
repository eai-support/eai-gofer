---
name: visual-consistency
description: "Audits a deck for consistent fonts, colors, chart styles, alignment, terms and numbers. Use before a deck is shared."
---

# Visual Consistency

Make the deck look like one team made it, by applying one style across all slides.

## Input

- The deck or its slide descriptions, and the brand or template guide if one exists.

## Method

1. Write or confirm the style spec:
   - Fonts and sizes for title, body, and footnote.
   - Color palette and meaning. The same entity keeps the same color on every slide.
   - Chart style: axes, gridlines, labels, and legend position.
   - Margins, alignment, and title position.
   - Icon and image style.
   - Terms, capitalization, number formats, and date formats.
   - Source and footnote placement, and section trackers.
2. Check every slide against the spec.
3. Log each deviation with the fix.

## Output

1. Style spec (short table).
2. Deviation log: Slide # | Element | Issue | Fix.

## Quality bar

- One meaning per color across the deck.
- Same number shown the same way everywhere.

## Boundaries

- Not for arranging a single slide: use `slide-layout`.
- Not for the final readiness review: use `deck-quality-check`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
