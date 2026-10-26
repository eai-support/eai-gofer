# Consulting Routing In Gofer

Gofer routes business consulting requests to the consulting skills in
`.specify/references/consulting/skills/`. This file keeps the non-app path MECE:
every request type has exactly one owner, either a consulting skill or a Gofer
function.

## Route Test

Decide by the subject of the work, not by the words used. Check the rows in
order and stop at the first match.

| #   | Request                                                                                                                                                          | Route                       | Owner                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| 1   | A general question with no deliverable and no repo work, or a request in "Requests With No Owner"                                                                | Conversation                | Gofer's existing conversation handling                   |
| 2   | Work on an existing Gofer feature: its problem, value, specification, delivery documents, or release communications                                              | The feature's current route | The Gofer column of the owner table                      |
| 3   | The user asks Gofer to build or change an app, workflow, or software                                                                                             | App delivery                | Gofer numbered stages with EAI readiness                 |
| 4   | Technical work on software, code, cloud, or data platforms: engineering review, codebase exploration, or migration planning                                      | Technical non-app           | Gofer research/docs path                                 |
| 5   | The client's business, with nothing to build: strategy, markets, customers, finances, operations, organization, change, or a deliverable a consulting skill owns | Business consulting         | The consulting column of the owner table, or the catalog |
| 6   | Still ambiguous between building and advising                                                                                                                    | App delivery                | Gofer numbered stages with EAI readiness                 |

App words alone do not make app work. A KPI definition, dashboard wireframe,
process map, operating model, or business case with nothing to build matches
row 5.

## Owner Table

Each row is a request type that two functions could claim. Use the owner in the
column that matches the subject. Each cell has one owner; a qualifier in
brackets says which part it owns.

| Request                        | Subject is a Gofer feature or software                                                                 | Subject is the client's business                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Define or validate the problem | `0a_problem_validation` (with its `business-problem-validator` agent)                                  | `problem-framing`                                                                         |
| Find root causes               | `0a_problem_validation` (a problem a feature will fix), or `gofer_diagnose` (a software fault)         | `issue-tree` (a business question), or `process-mapping` (one process)                    |
| Map stakeholders               | `0a_problem_validation` (cost to each stakeholder of a feature problem)                                | `stakeholder-map` (influence, stance, engagement)                                         |
| Value an investment            | `0a_problem_validation` (go or no-go sketch for a feature idea)                                        | `business-case` (NPV, IRR, payback, or a funding ask, even when the investment is an app) |
| Research                       | `1_gofer_research` (codebase, integrations, technology, and build or buy for a software capability)    | `research-synthesis` (desk sources, after `source-validation`)                            |
| Size or compare a market       | `1_gofer_research` (vendor products for a feature)                                                     | `market-sizing` (market size), or `competitor-benchmark` (peer comparison)                |
| Scan trends                    | `research-horizon-scanner` (technology for a feature)                                                  | `pestel-scan`                                                                             |
| Compare futures or options     | `0_gofer_start` business scenarios (candidate app use cases)                                           | `scenario-analysis` (futures), or `strategic-options` (choices)                           |
| Design a dashboard             | App delivery (a working dashboard)                                                                     | `kpi-dashboard` (KPI tree, definitions, wireframe)                                        |
| Redesign how work is done      | App delivery (a guided digital process)                                                                | `process-mapping` (one process), or `operating-model` (the organization)                  |
| Summarize for executives       | `gofer_spec_summary` (from `spec.md` or `plan.md`)                                                     | `executive-summary` (from a finished deliverable)                                         |
| Communicate a change           | `7a_stakeholder_comms` (with its `comms-writer` agent, for a feature with a passing validation report) | `change-plan` (people-side change), or `status-report` (programme progress)               |
| Present live                   | `7a_stakeholder_comms` (software demo script)                                                          | `speaker-notes` (presenting a deck)                                                       |
| Show risks                     | `visual-risk-writer` (feature requirements and validation findings)                                    | `risk-assessment` (risks to delivering a plan)                                            |
| Measure performance            | `business-metrics-analyzer` (Gofer delivery metrics)                                                   | `kpi-dashboard` (business KPIs)                                                           |
| Write durable documents        | `gofer-documentation` (delivery documentation and lineage)                                             | The consulting skill that owns the deliverable                                            |
| Define terms                   | `gofer_vocabulary` (feature glossary)                                                                  | `appendix-builder` (deck glossary page)                                                   |
| Validate the work              | `6_gofer_validate`                                                                                     | The Quality bar of the skill that owns the deliverable (`deck-quality-check` for decks)   |
| Plan the work                  | `3_gofer_plan` (software plan), then `4_gofer_tasks`                                                   | `implementation-roadmap` (client initiatives)                                             |

These owners do not depend on the subject:

| Request                                                                             | Owner                                                           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Create or change a brand profile, logo use, or document and deck templates          | `8_gofer_branding`                                              |
| Apply a brand profile consistently across one deck                                  | `visual-consistency` (reads the brand profile when one exists)  |
| Show system boundaries                                                              | `gofer_zoom_out`                                                |
| Save a checkpoint, open a side conversation, toggle plan mode, or set a personality | `7_gofer_save`, `gofer_side`, `gofer_plan`, `gofer_personality` |
| Check or set up the workspace scaffold                                              | `gofer_check_workspace`, `gofer_bootstrap_workspace`            |

## Stage Map

For a multi-session engagement, Gofer keeps its numbered stages. On this route,
each stage file defers to the row below and keeps only its Continuation And Stop
Contract. Each skill has one home stage; a later stage may reuse its output but
does not redo it.

| Stage               | Consulting method                                                                                                                                                                                                                                                                                                                                                     | Stage output                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `0_gofer_start`     | `engagement-proposal`, `problem-framing`, `audience-brief`                                                                                                                                                                                                                                                                                                            | Proposal, problem statement, audience brief                                  |
| `1_gofer_research`  | `issue-tree`, `hypothesis-map`, `mece-check`, `source-validation`, `research-synthesis`, `interview-synthesis`, `survey-analysis`, `pestel-scan`, `five-forces`, `market-sizing`, `customer-segmentation`, `competitor-benchmark`, `value-chain`, `process-mapping`, `vrio-analysis`                                                                                  | Workplan, evidence, and analyses                                             |
| `2_gofer_specify`   | `swot-analysis`, `growth-strategy`, `strategic-options`, `portfolio-matrix`, `pricing-strategy`, `unit-economics`, `financial-model`, `business-case`, `scenario-analysis`, `sensitivity-analysis`, `insight-synthesis`                                                                                                                                               | Options, numbers, and the answer                                             |
| `3_gofer_plan`      | `scqa-storyline`, `pyramid-structure`, `recommendation-deck`, `data-storytelling`                                                                                                                                                                                                                                                                                     | Storyline and deliverable plan (a ghost deck when the deliverable is a deck) |
| `4_gofer_tasks`     | No consulting skill. Split the deliverable plan into section and exhibit tasks                                                                                                                                                                                                                                                                                        | Task list                                                                    |
| `5_gofer_implement` | `chart-selection`, `data-visualization`, `exhibit-builder`, `action-titles`, `slide-layout`, `slide-copy-editor`, `visual-consistency`, `appendix-builder`, `speaker-notes`, `executive-summary`, `decision-memo`, `implementation-roadmap`, `operating-model`, `raci-builder`, `stakeholder-map`, `change-plan`, `risk-assessment`, `kpi-dashboard`, `status-report` | The deliverable                                                              |
| `6_gofer_validate`  | `deck-quality-check` for decks; for any other deliverable, the Quality bar of the skill that owns it                                                                                                                                                                                                                                                                  | Readiness verdict and routed fixes                                           |

## Rules For The Consulting Route

1. Size the work first. A single output uses one skill directly: no feature
   files, no numbered stages, and no workspace preflight. A multi-session
   engagement runs the workspace preflight, records `Route: Business consulting`
   in `.specify/specs/{engagement}/discovery.md`, and follows the stage map.
2. Pick skills by the output the user needs. The catalog in `README.md` names
   the one output each skill owns.
3. Do not run EAI readiness, app preview, UI branding intake, service-fit
   review, code review, test generation, delivery lineage, or delivery
   checkpoints for consulting work. Each deliverable passes the Quality bar of
   the skill that owns it. Decks also pass `deck-quality-check`.
4. Keep Gofer's response gate, blocker rules, and session checkpoints
   (`7_gofer_save`). They apply to every route.
5. Consulting skills do not call Gofer functions. Only this router moves work
   between routes. If a consulting result calls for something to be built, stop
   the consulting route, start app delivery, and use that result as discovery
   input.

## Requests With No Owner

Route these as conversation (row 1). Answer them directly, or say they are out
of scope; do not force them into a consulting skill:

- Survey or interview-guide design, data collection, and workshop facilitation.
- Firm-wide cost programmes, and legal, tax, or M&A diligence.
- Business capability maps, training content, and vendor selection outside
  software.
- Emails, agendas, and meeting minutes.
