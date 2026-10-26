---
name: action-titles
description: "Writes full-sentence insight headlines for slides and checks that the titles read as the storyline. Use for slide titles and headlines."
---

# Action Titles

Write slide headlines that state the insight, so the titles alone tell the story.

## Input

- Slides or a ghost deck (from `recommendation-deck`), with the content each slide shows.

## Method

1. Write each title as a full sentence with a verb that states the so-what. Weak: "Labor costs". Strong: "Labor drives 60% of the margin gap with peers".
2. Keep titles to 15 words or fewer, and 2 lines at most.
3. Quantify where the data allows.
4. Claim only what the slide proves.
5. Keep tense and terms consistent across slides.
6. Horizontal read: list all titles in order. Do they tell the whole story without the slides? Flag gaps and repeats to `recommendation-deck`.

## Output

1. Table: Slide # | Current title | New title | Proven by slide (Yes or No).
2. The title sequence as a single list, with notes on gaps.

## Quality bar

- No topic labels as titles.
- The title sequence reads as a coherent argument.

## Boundaries

- Not for body text: use `slide-copy-editor`.
- Not for slide order and storyline: use `recommendation-deck`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
