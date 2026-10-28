---
doc_id: consulting-firm-gtm.industry-coverage
title: Consulting Firm GTM - Industry Scenario Coverage
status: draft
owners:
  - EAI Product
updated: 2026-10-28
---

# Consulting Firm GTM - Industry Scenario Coverage

This check maps the 90 EAI industry scenarios in 13 industries to the 64
consulting skills and to Gofer's app delivery path. Source: the EAI scenario
library at <https://www.enterpriseaigroup.com/docs/eai/scenarios>, read from its
published source on 2026-10-28.

## Result

- **Covered:** every scenario has a consulting path to advise the client and a
  Gofer app delivery path to build the app.
- **Two gaps:** no skill owns a customer journey map, and no skill owns a map of
  the rules a regulated process must meet. See
  [Gaps](#gaps-and-recommendations).
- **Fixed in this change:** the opportunity scan now names optimize and schedule
  uses, and the workflow redesign uses the same four stages as the scenarios.

## How One Scenario Maps

Every EAI scenario uses the same four steps. The table shows which skill advises
on each step and which Gofer function builds it.

| Scenario step                    | Consulting skills (advise)                                                                                                              | Gofer app delivery (build)                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Before step 1: frame and size    | `problem-framing`, `engagement-proposal`, `ai-readiness-assessment`, `ai-opportunity-scan`, `ai-disruption-assessment`, `business-case` | `0_gofer_start` business scenarios                                  |
| 1. Capture demand and context    | `process-mapping`, `business-object-map`                                                                                                | Object Types, intake forms, and chat capture, through stages 1 to 5 |
| 2. Prepare the decision          | `ai-workflow-redesign`, `ai-governance-controls`, `ai-bootcamp-design`                                                                  | AI summaries, classification, document search, and chat assistance  |
| 3. Execute and collaborate       | `ai-workflow-redesign`, `raci-builder`, `operating-model`, `ai-workforce-plan`, `change-plan`                                           | Object Type actions and workflows                                   |
| 4. Resolve, explain, and improve | `kpi-dashboard`, `ai-value-capture-plan`, `ai-value-tracker`, `pilot-to-scale-review`                                                   | Outcome records and reporting, then `6_gofer_validate`              |

The hand-over from advice to build goes through the Gofer router. The
`business-object-map` output becomes discovery input for the app's Object Types.
The `ai-workflow-redesign` output becomes the app's four-step journey. The
`ai-value-tracker` measures become the app's success measures.

## Coverage By Industry

| Industry             | Scenarios | Mission measures                                      | Scenario needs                                                                       | Skills that cover them                                                                                                          | Gaps                       |
| -------------------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Healthcare           | 10        | Patient experience, admin burden, care quality        | Intake, prior authorisation and claims rules, credentialing, clinical oversight      | `process-mapping`, `ai-workflow-redesign`, `business-object-map`, `ai-governance-controls`, `kpi-dashboard`, `ai-value-tracker` | Journey map, rules map     |
| Finance              | 10        | Cycle time, compliance quality, revenue or loss       | KYC and anti-money-laundering rules, alert triage, underwriting rules                | `ai-governance-controls`, `business-object-map`, `ai-workflow-redesign`, `risk-assessment`, `unit-economics`, `business-case`   | Rules map                  |
| Government           | 5         | Response time, citizen trust, service levels          | Citizen requests, records and redaction rules, transparency                          | `process-mapping`, `ai-governance-controls`, `kpi-dashboard`, `stakeholder-map`                                                 | Journey map, rules map     |
| Retail               | 5         | Conversion, service friction, margin                  | Returns and loyalty journeys, tier rules, supplier performance, product certificates | `customer-segmentation`, `pricing-strategy`, `unit-economics`, `kpi-dashboard`, `business-object-map`                           | Journey map, rules map     |
| Education            | 5         | Decision speed, learner experience, enrolment         | Admissions, early warning, accreditation evidence                                    | `ai-opportunity-scan`, `business-object-map`, `kpi-dashboard`, `ai-governance-controls`                                         | Journey map, rules map     |
| Real Estate          | 10        | Deal cycle time, tenant experience, asset performance | Lease and renewal rules, inspections, bids and estimates, due diligence              | `business-object-map`, `process-mapping`, `financial-model`, `business-case`, `sensitivity-analysis`, `risk-assessment`         | Journey map                |
| Manufacturing        | 5         | Throughput, defects, resilience                       | Root causes, maintenance prediction, supplier performance                            | `process-mapping`, `ai-opportunity-scan`, `kpi-dashboard`, `value-chain`                                                        | None                       |
| Legal                | 10        | Matter turnaround, risk control, knowledge reuse      | Obligations and deadlines, privilege, billing leakage                                | `business-object-map`, `ai-governance-controls`, `ai-workflow-redesign`, `pricing-strategy`, `unit-economics`                   | Rules map                  |
| Non-Profit           | 5         | Mission reach, stewardship, reporting quality         | Impact measures, donor retention, grant compliance                                   | `kpi-dashboard`, `customer-segmentation`, `ai-opportunity-scan`                                                                 | Journey map, rules map     |
| Logistics            | 10        | On-time performance, exception cost, productivity     | Routing and scheduling, exceptions, supplier risk, procurement savings               | `ai-opportunity-scan`, `ai-workflow-redesign`, `kpi-dashboard`, `risk-assessment`, `unit-economics`                             | Journey map (minor)        |
| Business Services    | 5         | Utilisation, service levels, client experience        | Service catalogues, recruitment, consulting delivery, training                       | `hypothesis-map`, `interview-synthesis`, `ai-value-tracker`, `ai-workforce-plan`, `operating-model`                             | Journey map (minor)        |
| Marketing & Creative | 5         | Campaign throughput, conversion, creative quality     | Market research delivery, personas, campaign measures                                | `survey-analysis`, `interview-synthesis`, `customer-segmentation`, `kpi-dashboard`                                              | Journey map, survey design |
| Technology Services  | 5         | Resolution time, retention, support productivity      | Service levels, incidents, ERP delivery, security governance                         | `process-mapping`, `operating-model`, `kpi-dashboard`, `ai-governance-controls`, `implementation-roadmap`                       | None                       |

Software work inside a scenario, such as ERP configuration, data migration, or
system tests, goes to Gofer's app delivery or technical route, not to the
consulting skills.

## Gofer App Delivery Path

The consulting work did not remove or weaken any Gofer app function. The change
adds a consulting guard at the top of stages 0 to 6 and leaves the app path as
it was.

- Pipeline stages: `0_gofer_start` to `6_gofer_validate`, with EAI readiness,
  the four-step app journey, the UI preview loop, and validation.
- Helpers: `0a_problem_validation`, `7_gofer_save`, `7a_stakeholder_comms`,
  `8_gofer_branding`, `9_gofer_tests`, `10_gofer_cloud`, `gofer_eai_first_run`,
  `gofer_diagnose`, `gofer_tdd`, `gofer_hydrate`, and the other control
  commands.
- App signals still route to app delivery whenever the user asks Gofer to build
  or change something.

Gofer has no separate design sprint function. The closest functions are:

- `ai-bootcamp-design`, which plans a 1 to 5 day hands-on build session with a
  go or no-go decision;
- the four-step app journey and UI preview loop in app delivery, which show the
  working app early and often.

## Gaps And Recommendations

### G1 Customer Journey Map

No skill owns the customer's view of a service: the stages, touchpoints, moments
that matter, pain points, and the back-office steps behind each one.
`process-mapping` covers the internal process only.

- **Scenarios affected (33):** patient intake, telemedicine, medical
  administration and mental health; insurance claims, loan processing, mortgage
  origination, KYC and claims adjusting; citizen services, planning permits,
  public records and grant management; e-commerce returns and loyalty;
  admissions and course management; maintenance requests, property management,
  real estate CRM, lease management and closing; last-mile delivery, shipment
  tracking and travel management; donor management, volunteer coordination and
  beneficiary tracking; recruitment and the administrative services hub; SaaS
  support and IT managed services; legal case management.
- **Recommendation:** add `customer-journey-map` to catalog phase 3. It fits the
  core install set.

### G2 Compliance Obligation Map

No skill owns the map from each rule a regulated process must meet to its
evidence, control, owner, and frequency. `ai-governance-controls` covers AI
controls only, and `risk-assessment` covers delivery risks only.

- **Scenarios affected (21):** KYC, transaction monitoring, fund administration,
  accounting and audit, mortgage origination and insurance brokerage; clinical
  trials, prior authorisation, provider credentialing, pharmacy back office and
  revenue cycle; regulatory compliance and public records; legal compliance
  monitoring and the contract counsel desk; product compliance; accreditation
  and research grants; grant reporting; supplier risk; cybersecurity operations.
- **Recommendation:** add `compliance-obligation-map` to catalog phase 7, as
  business mapping that labels each rule for confirmation by counsel. It fits
  the core install set.

### G3 Survey And Interview Guide Design

Questionnaire and interview-guide design is out of scope on purpose. It affects
the market research delivery scenario and interview-heavy work.

- **Recommendation:** keep it out of scope unless market research becomes a
  target practice.
