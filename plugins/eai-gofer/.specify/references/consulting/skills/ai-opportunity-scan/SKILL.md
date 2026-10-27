---
name: ai-opportunity-scan
description: "Finds and ranks AI uses by value, effort, risk and data readiness. Use to answer what AI can do for a client."
---

# AI Opportunity Scan

Show where AI can create the most value in a client's business, in the client's own language.

## Input

- The business unit or processes in scope, the industry, main costs, volumes, and pain points. Interview notes, process maps, and documents help.

## Method

1. Set the scope and the value lens: cost, revenue, quality, risk, or speed.
2. List the work in scope by activity or process step. Reuse `process-mapping` or `value-chain` output when it exists.
3. For each activity, name the AI pattern that could change it: draft, summarize, classify, extract, answer questions, predict, recommend, check, or route work. Describe each use as a change in the work, in plain words.
4. Estimate gross value at stake per year. For time: volume x share of items AI can handle x time saved per item x loaded hourly cost. For revenue: volume x uplift x margin. Label each figure [Estimate] gross capacity, not savings, and show its inputs.
5. Rate three scores from 1 to 5, where 5 is always best: effort (1 very hard, 5 easy), risk (1 high or blocked, 5 low), and data readiness (1 not available, 5 ready). Ease is their average. Risk covers errors, privacy, harm to customers, and regulation. A risk score of 1 holds the use until governance clears it.
6. Rank the uses on a value-versus-ease matrix. Expect most value from a few uses; do not spread effort across many.
7. Where industry evidence exists, show adoption and reported returns for similar uses, with sources.
8. Pick 3 to 5 priority uses and state the next step for each.

## Output

1. Use list: Use | Activity | AI pattern | Value at stake | Effort | Risk | Data readiness | Ease | Priority.
2. Value-versus-ease matrix as a table or chart.
3. Priority uses with next steps, written for a reader who is new to AI.

## Quality bar

- Each value figure shows its formula and inputs, and is labeled gross capacity.
- Each use describes a change in the work, not a tool.

## Boundaries

- Not for redesigning the chosen workflow: use `ai-workflow-redesign`.
- Not for the investment case: use `business-case`.
- Not for organization-wide readiness: use `ai-readiness-assessment`.
- Not for testing one use on client data: use `ai-bootcamp-design`.
- Not for ranking existing business units: use `portfolio-matrix`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
