---
name: slide-copy-editor
description: "Edits slide body text for brevity, parallel bullets, plain words and consistent numbers. Use to tighten slide body text."
---

# Slide Copy Editor

Make slide body text short, clear, and consistent, without changing its meaning.

## Input

- Slide body text: bullets, labels, callouts, and footnotes. Titles are out of scope.

## Method

1. Cut words. Aim for 50 to 70 words of body text per slide.
2. Keep one idea per bullet and no more than 2 bullet levels.
3. Make bullets parallel: all start with a verb, or all with a noun.
4. Use active voice and plain words. Define each acronym on first use.
5. Apply the number and term rules from `visual-consistency`. If none exist, keep each slide consistent.
6. Remove hedges, filler, and repeated points.
7. Keep every fact and figure. Flag any edit that might change meaning.

## Output

1. Table: Slide # | Before | After | Change notes.
2. Word count before and after.

## Quality bar

- No change of meaning or data.
- Bullets on a slide share one grammatical form.

## Boundaries

- Not for slide titles: use `action-titles`.
- Not for setting deck-wide style, number, or term rules: use `visual-consistency`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
