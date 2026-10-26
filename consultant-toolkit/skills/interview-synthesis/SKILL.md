---
name: interview-synthesis
description: "Codes interview, expert-call or focus-group notes into themes with frequency, quotes and contradictions. Use for qualitative primary research."
---

# Interview Synthesis

Turn conversation notes or transcripts into evidence-backed themes.

## Input

- Interview, expert-call, or focus-group transcripts or notes, with each respondent's role or segment.

## Method

1. Build a codebook: start with codes from the interview guide, then add codes that emerge from the notes.
2. Code each interview. Count respondents per theme, not mentions.
3. Split counts by respondent type, such as customer vs. employee or region.
4. Pick one or two short, representative quotes per theme. Remove names and identifying details.
5. Record contradictions and outliers. Do not hide them.
6. Check saturation: did new interviews still add new themes?
7. State each theme as a full-sentence finding.

## Output

1. Theme table: Theme | Respondents (n of N) | Segments | Representative quote | Confidence.
2. Contradictions and outliers.
3. Codebook (code, definition).

## Quality bar

- Counts show n of N, and small samples are labeled as directional.
- Quotes support, not replace, the finding.
- No personal data in the output.

## Boundaries

- Not for questionnaire responses, including open-ended survey answers: use `survey-analysis`.
- Not for secondary sources: use `research-synthesis`.
- Hand off to: `insight-synthesis`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts or figures. Label estimates [Estimate] and cite every source.
