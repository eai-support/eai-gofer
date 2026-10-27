---
name: scqa-storyline
description: "Writes the Situation, Complication, Question, Answer opening of a storyline. Use to start any deck, memo or presentation."
---

# SCQA Storyline

Write the opening that makes the audience want the answer, then gives it.

## Input

- The answer (from `insight-synthesis`), the context, and the audience (from `audience-brief` if available).

## Method

1. Situation: a fact the audience already accepts. Keep it short and uncontroversial.
2. Complication: what changed, or the tension that makes the situation unstable.
3. Question: the question the complication raises. It may stay implied.
4. Answer: the governing thought. Take it from `insight-synthesis` and refine only the wording.
5. Choose the order:
   - Standard (S-C-Q-A) for most audiences.
   - Direct (A, then S-C) for senior or time-poor audiences.
   - Concern-led (C-S-A) when the audience already feels the problem.
6. Keep the whole opening to 4 to 6 sentences.

## Output

1. The SCQA, labeled.
2. The recommended order and why.
3. A one-sentence version for an elevator pitch or email subject.

## Quality bar

- The audience would agree with the situation.
- The answer responds to the question raised, exactly.

## Boundaries

- Not for the supporting argument: use `pyramid-structure`.
- Not for the slide plan: use `recommendation-deck`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
