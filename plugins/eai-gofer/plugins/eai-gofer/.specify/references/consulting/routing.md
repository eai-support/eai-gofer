# Consulting Routing In Gofer

Gofer routes business consulting requests to the consulting skills in
`.specify/references/consulting/skills/`. This file keeps the non-app path MECE:
every request type has exactly one owner, either a consulting skill or a Gofer
function.

## Route Test

Decide by the subject of the work, not by the words used. Check the rows in
order and stop at the first match.

| #   | Subject of the work                                                                                                                               | Route               | Owner                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------- |
| 1   | Conversation with no deliverable                                                                                                                  | Conversation        | Answer directly                          |
| 2   | An app, workflow, or software change that will be built                                                                                           | App delivery        | Gofer numbered stages with EAI readiness |
| 3   | A Gofer feature: its problem, specification, delivery documents, or release communications                                                        | Technical non-app   | The Gofer function in the owner table    |
| 4   | Software, code, cloud, data platforms, engineering review, or migration planning                                                                  | Technical non-app   | Gofer research/docs path                 |
| 5   | The client's business, with nothing to build: strategy, markets, customers, finances, operations, organization, change, or a business deliverable | Business consulting | Consulting skills, through the stage map |
| 6   | Still ambiguous between building and advising                                                                                                     | App delivery        | Gofer numbered stages with EAI readiness |

App words alone do not make app work. A KPI definition, dashboard wireframe,
process map, operating model, or change plan with nothing to build matches
row 5.

## Owner Table

Each row is a request type that two functions could claim. Use the owner in the
column that matches the subject.

| Request                        | Subject is a Gofer feature or software                                                     | Subject is the client's business                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Define or validate the problem | `0a_problem_validation`, `business-problem-validator` (a problem with a solution to build) | `problem-framing` (a key question to analyze)                            |
| Find root causes               | `0a_problem_validation` (a problem a feature will fix), `gofer_diagnose` (software faults) | `issue-tree` (business question), `process-mapping` (one process)        |
| Map stakeholders               | `0a_problem_validation` (cost to each stakeholder of a feature problem)                    | `stakeholder-map` (influence, stance, engagement)                        |
| Value an investment            | `0a_problem_validation` (go or no-go sketch for a feature idea)                            | `business-case` (NPV, IRR, payback, or a funding ask, even for an app)   |
| Research                       | `1_gofer_research` (codebase, integrations, technology)                                    | `source-validation`, `research-synthesis` (desk sources)                 |
| Scan a market                  | `research-market-scanner` (build or buy for a software capability)                         | `market-sizing`, `competitor-benchmark`                                  |
| Scan trends                    | `research-horizon-scanner` (technology for a feature)                                      | `pestel-scan`                                                            |
| Compare futures or options     | `0_gofer_start` business scenarios (candidate app use cases)                               | `scenario-analysis`, `strategic-options`                                 |
| Design a dashboard             | App delivery (a working dashboard)                                                         | `kpi-dashboard` (KPI tree, definitions, wireframe)                       |
| Redesign a process             | App delivery (a guided digital process)                                                    | `process-mapping`, `operating-model`                                     |
| Summarize for executives       | `gofer_spec_summary` (from `spec.md` or `plan.md`)                                         | `executive-summary` (from a finished deliverable)                        |
| Communicate a change           | `7a_stakeholder_comms`, `comms-writer` (a Gofer feature with a passing validation report)  | `change-plan` (people-side change), `status-report` (programme progress) |
| Present live                   | `7a_stakeholder_comms` (software demo script)                                              | `speaker-notes` (presenting a deck)                                      |
| Show risks                     | `visual-risk-writer` (feature requirements and validation findings)                        | `risk-assessment` (risks to delivering a plan)                           |
| Measure performance            | `business-metrics-analyzer` (Gofer delivery metrics)                                       | `kpi-dashboard`                                                          |
| Write durable documents        | `gofer-documentation` (delivery documentation and lineage)                                 | The consulting skill that owns the deliverable                           |
| Brand documents and decks      | `8_gofer_branding` (brand profile and templates)                                           | `visual-consistency` (applies that profile across one deck)              |
| Define terms                   | `gofer_vocabulary` (feature glossary)                                                      | `appendix-builder` (deck glossary page)                                  |
| Show system boundaries         | `gofer_zoom_out`                                                                           | Not a consulting output                                                  |
| Validate the work              | `6_gofer_validate`                                                                         | `deck-quality-check`                                                     |
| Plan delivery work             | `3_gofer_plan`, `4_gofer_tasks`                                                            | `implementation-roadmap` (client initiatives)                            |

These Gofer control functions serve every route and own no consulting output:
`7_gofer_save`, `gofer_side`, `gofer_plan`, `gofer_personality`,
`gofer_check_workspace`, and `gofer_bootstrap_workspace`.

## Stage Map

Gofer keeps its numbered stages for consulting engagements. On this route, each
stage skips its software steps and uses the consulting skills below as its
method. Each skill has one home stage; a later stage may reuse its output but
does not redo it.

| Stage               | Consulting method                                                                                                                                                                                                                                                                                                                                                     | Stage output                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `0_gofer_start`     | `engagement-proposal`, `problem-framing`, `audience-brief`                                                                                                                                                                                                                                                                                                            | Proposal, problem statement, audience brief |
| `1_gofer_research`  | `issue-tree`, `hypothesis-map`, `mece-check`, `source-validation`, `research-synthesis`, `interview-synthesis`, `survey-analysis`, `pestel-scan`, `five-forces`, `market-sizing`, `customer-segmentation`, `competitor-benchmark`, `value-chain`, `process-mapping`, `vrio-analysis`                                                                                  | Workplan, evidence, and analyses            |
| `2_gofer_specify`   | `swot-analysis`, `growth-strategy`, `strategic-options`, `portfolio-matrix`, `pricing-strategy`, `unit-economics`, `financial-model`, `business-case`, `scenario-analysis`, `sensitivity-analysis`, `insight-synthesis`                                                                                                                                               | Options, numbers, and the answer            |
| `3_gofer_plan`      | `scqa-storyline`, `pyramid-structure`, `recommendation-deck`, `data-storytelling`                                                                                                                                                                                                                                                                                     | Storyline and ghost deck                    |
| `4_gofer_tasks`     | No consulting skill. Split the ghost deck into exhibit and section tasks                                                                                                                                                                                                                                                                                              | Task list                                   |
| `5_gofer_implement` | `chart-selection`, `data-visualization`, `exhibit-builder`, `action-titles`, `slide-layout`, `slide-copy-editor`, `visual-consistency`, `appendix-builder`, `speaker-notes`, `executive-summary`, `decision-memo`, `implementation-roadmap`, `operating-model`, `raci-builder`, `stakeholder-map`, `change-plan`, `risk-assessment`, `kpi-dashboard`, `status-report` | The deliverable                             |
| `6_gofer_validate`  | `deck-quality-check`                                                                                                                                                                                                                                                                                                                                                  | Readiness verdict and routed fixes          |

## Rules For The Consulting Route

1. Size the work first. A single question or output uses one skill directly and
   needs no feature files. Use the stage map only for multi-session engagements,
   and store their outputs in `.specify/specs/{engagement}/`.
2. Pick skills by the output the user needs. The catalog in `README.md` names
   the one output each skill owns.
3. Do not run EAI readiness, app preview, UI branding intake, service-fit
   review, code review, test generation, or delivery lineage for consulting
   work.
4. Keep Gofer's response gate, blocker rules, and checkpoints. They apply to
   every route.
5. Consulting skills do not call Gofer functions. Only this router moves work
   between routes. If a consulting result calls for something to be built, stop
   the consulting route, start app delivery, and use that result as discovery
   input.

## Requests With No Owner

Do not force these into a consulting skill. Answer them as conversation, or say
they are out of scope:

- Survey or interview-guide design, data collection, and workshop facilitation.
- Firm-wide cost programmes, and legal, tax, or M&A diligence.
- Business capability maps, training content, and vendor selection outside
  software.
- Emails, agendas, and meeting minutes.
