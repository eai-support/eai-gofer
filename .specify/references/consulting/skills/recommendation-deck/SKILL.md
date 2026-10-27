---
name: recommendation-deck
description: "Turns a storyline into a ghost deck: slide-by-slide titles, exhibits and sources, main and appendix. Use to plan a deck."
---

# Recommendation Deck

Plan the whole deck as a ghost deck before anyone builds a slide.

## Input

- The pyramid (from `pyramid-structure`), the SCQA opening (from `scqa-storyline`), and the audience brief. An existing deck to restructure also works.

## Method

1. Map the pyramid to sections: one section per key line.
2. Give each slide one message. Write a draft title that states it.
3. Describe the exhibit or content that proves each message, and its data source.
4. Use a standard flow: title, executive summary, context (SCQA), sections, recommendation, roadmap, next steps and asks, appendix.
5. Set length for the audience. A steering committee often needs 10 to 15 main slides.
6. Keep a slide in the main deck only if it moves the argument. Move the rest to the appendix list.
7. Mark the status of each slide: data ready, analysis pending, or open question.

## Output

Ghost deck table: # | Section | Draft title (the message) | Exhibit or content | Data source | Main or appendix | Status.

## Quality bar

- Reading the draft titles in order tells the full story.
- Each slide has exactly one message.

## Boundaries

- Not for final headline wording: use `action-titles`.
- Not for slide arrangement: use `slide-layout`.
- Not for building the appendix: use `appendix-builder`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
