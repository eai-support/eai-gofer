---
name: business-object-map
description: "Maps the business data model of a process: objects, fields, links, states, actions and access. Use to define a data model in business terms."
---

# Business Object Map

Describe, in business language, the things a process creates, changes, and decides about, so that people agree on them before anything is built.

## Input

- The process or workflow in scope (from `process-mapping` or `ai-workflow-redesign` when they exist), the documents and forms it uses, and the systems that hold its data today.

## Method

1. List the nouns the process works with, for example Claim, Assessment, and Payment. Keep only those with their own identity and life cycle. These are the business objects. Name the business key that identifies one instance, for example a claim number.
2. For each object, write its purpose, owner, source of truth today, and the documents attached to it.
3. List each object's key fields with a plain type: text, number, date, yes or no, choice from a list, file, or link to another object. Mark the required fields.
4. Map the links and how many on each side, including whether zero is allowed: zero or one, exactly one, zero or many, or one or many. If a many-to-many link has its own fields or states, make it an object.
5. Set each object's states, for example submitted, in review, approved, and closed, and the allowed moves between them.
6. List the actions that move an object between states: who may take each action, the rule that must hold first, and what the action changes.
7. List who may see and change each object, and which fields are sensitive.
8. Check the map against real cases: every case can be recorded, and no field holds two meanings.

## Output

1. Object catalog: Object | Business key | Purpose | Owner | Source today | Documents.
2. Field table per object: Field | Type | Required | Meaning.
3. Link table: From | To | How many | Meaning.
4. Action table: Object | Action | Who | From state | To state | Rule | Changes.
5. Access table: Object | Who can see | Who can change | Sensitive fields.
6. Optional: a Mermaid entity diagram where it renders.

## Quality bar

- Every field has one meaning, and every state move has a named action.
- Real cases from the process fit the map without workarounds.

## Boundaries

- Not for the steps and timing of the process: use `process-mapping`.
- Not for performance measures: use `kpi-dashboard`.
- Not for accountability for activities: use `raci-builder`.
- Not for organization structure: use `operating-model`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
