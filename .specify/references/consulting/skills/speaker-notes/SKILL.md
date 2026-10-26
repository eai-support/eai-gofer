---
name: speaker-notes
description: "Writes presenter notes per slide: key message, talk track, transitions, timing and likely questions. Use to prepare a live presentation."
---

# Speaker Notes

Prepare the presenter to deliver each slide clearly and on time.

## Input

- The deck, the time slot, and the audience (from `audience-brief` if available).

## Method

For each slide, write:

1. Key message: one sentence to say first.
2. Talk track: 3 to 5 bullets, about 60 to 90 seconds.
3. Numbers to say out loud, rounded for speech.
4. Transition: one sentence that leads into the next slide.
5. Likely questions with short answers, and where the backup is (for example "A3").
6. A cut option if time runs short.

Then total the timing and compare it with the slot. Leave 20% for discussion.

## Output

1. Notes per slide in the order above.
2. Timing table: Slide # | Minutes | Cumulative.

## Quality bar

- Notes are spoken language, not slide text read aloud.
- Total time fits the slot with room for questions.

## Boundaries

- Not for editing slide text: use `slide-copy-editor`.
- Not for a written summary: use `executive-summary`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
