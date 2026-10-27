---
doc_id: consulting-firm-gtm.spec
title: Consulting Firm GTM - Specification
status: draft
owners:
  - EAI Product
  - EAI Growth
updated: 2026-10-27
---

# Feature Specification: Consulting Firm GTM

## Executive Summary

Consulting firms with 1 to 250 people get the Gofer plugin free. It helps them
find AI opportunities and prove ROI for clients in industries they know. It then
helps them build a process-improvement app and run it on the EAI Platform. Each
first win can become a LinkedIn post that brings new consultants. EAI earns when
apps run, and from training, partner and consulting fees.

This specification defines what Gofer, its connector and the EAI Platform must
do. The [customer profile](discovery.md) defines the ICP. The
[50 business scenarios](business-scenarios.md) show each journey. The
[design](design.md) shows how the parts work together. The [plan](plan.md)
orders the work.

## Goal Ledger Alignment

- **Goal:** More client process-improvement apps live on EAI, built by
  consulting firms that know the client's industry.
- **Main number:** Apps live on EAI.
- **Supporting numbers:** Installs, first wins, shares, sign-ups and apps built.
- **Guardrails:** No client data in posts. No automatic posting. No access
  across workspaces. No invented EAI commands, prices or approvals.

## User Scenarios And Testing

The [business scenarios](business-scenarios.md) are the user stories. Each
scenario has an acceptance check. The priority stories are:

| Priority | Story                                                   | Scenarios                  |
| -------- | ------------------------------------------------------- | -------------------------- |
| P1       | Install in one click and get a first consulting win.    | BS-01, BS-06, BS-08, BS-09 |
| P1       | Turn a recommendation into a prototype in the Code tab. | BS-17, BS-18, BS-19        |
| P1       | Sign up, deploy into a client workspace and go live.    | BS-25, BS-27, BS-28, BS-36 |
| P1       | Share a first win with a referral link.                 | BS-42, BS-43               |
| P2       | Learn at the right moment and earn Level 1.             | BS-32, BS-33, BS-34        |
| P2       | Prove realised ROI after go-live.                       | BS-38                      |
| P3       | Roll out to a whole firm with company sign-in.          | BS-46, BS-47               |

### Edge Cases

- Personal data in client input (BS-14).
- An industry with no pack (BS-15).
- A Claude usage limit mid-build (BS-21).
- Scope growth beyond the first version (BS-23).
- Expired sign-in, abandoned sign-up or two workspaces (BS-29 to BS-31).
- A failed deploy (BS-41).
- A client name in a share post (BS-43).

## Requirements

Priority: **MVP** is in the first release. **Next** follows the MVP. **Later**
waits for a platform or Anthropic dependency.

### Functional Requirements

#### Attract And Install

- **FR-01 (MVP)** Gofer must be listed in Anthropic's plugin directory. Every
  share post and landing page must link straight to the listing.
- **FR-02 (MVP, then Next)** Each share link must carry a referral code. The MVP
  counts landing page visits per code. The Next release links the code to
  installs through the Gofer connector. No personal data is stored beyond the
  code.
- **FR-03 (MVP)** A landing page must explain, in plain language, what Gofer
  does, which Claude plan each step needs, and how to install it in Claude,
  Codex and GitHub Copilot.
- **FR-04 (MVP)** The first `/eai` run must ask for the client's industry and
  offer three starters: scan for AI opportunities, build an ROI case, or show a
  prototype.

#### Consulting Methods

- **FR-05 (MVP)** `/eai` must be the only public command. The consulting
  playbooks must load on demand and stay out of the slash menu.
- **FR-06 (Next)** A Gofer connector (MCP server) must serve the method
  catalogue, the share post and referral link, the training catalogue and usage
  events. It must also serve the methods in the MCP skills format when Claude
  supports it.
- **FR-07 (MVP)** Industry packs must give industry terms, typical processes,
  key measures and sourced benchmarks. The MVP packs are local government,
  retail, healthcare, finance, manufacturing and general.
- **FR-08 (MVP)** An AI opportunity scan must turn notes, process descriptions
  or documents into a ranked list. Each item must have value, effort, risk and
  data readiness ratings.
- **FR-09 (MVP)** An ROI model must give baseline, benefit drivers, costs,
  payback and a low and high case. It must label every assumption. It must
  export a spreadsheet and a one-page executive summary.
- **FR-10 (MVP)** Every client deliverable must start with a plain-language
  summary for a reader who knows little about AI, with a glossary.
- **FR-11 (MVP)** Deliverables must use the firm's brand template when one is
  set.
- **FR-12 (MVP)** Gofer must check each deliverable against its method checklist
  before handover: complete, no overlaps, sources cited and assumptions
  labelled.
- **FR-13 (MVP)** Gofer must warn before it uses personal data in client input
  and must offer to anonymise it.

#### Advice To App

- **FR-14 (MVP)** A chosen opportunity must become a Gofer business scenario and
  specification. Its ROI baseline and target must become success measures.
  Requests outside the first version must be recorded as later scope.
- **FR-15 (MVP)** Gofer must show how to move from Claude chat to the Code tab
  in Claude Desktop: open the Code tab, choose Local, open a folder and add the
  plugin.
- **FR-16 (MVP, then Next)** Gofer must offer process-improvement app templates.
  The MVP has the intake and triage template. The Next release adds approval
  workflow, inspection checklist, document sorting, knowledge assistant and
  scheduling.
- **FR-17 (MVP)** A consultant must be able to build and preview a prototype
  locally before they have an EAI account.
- **FR-18 (MVP)** Gofer must produce a client demo pack: screenshots, a short
  walkthrough script and before and after process maps.

#### Account And Workspace

- **FR-19 (MVP)** Before deploy, Gofer must check the EAI CLI, sign-in and
  company workspace. It must explain each missing step in plain language.
- **FR-20 (MVP)** When there is no account, Gofer must open the EAI website
  sign-up, explain the steps and resume with sign-in when the user returns.
- **FR-21 (Later)** The website sign-up must return the user to the Gofer
  session. Depends on EPR-1.
- **FR-22 (MVP)** Gofer must deploy each client's app into a client workspace
  under the firm's workspace. It must name the target workspace and wait for
  confirmation before deploy. The MVP creates client workspaces with the
  existing EAI CLI child-workspace capability.
- **FR-23 (MVP)** Client apps must default to workspace-only access. Gofer must
  help invite client staff.
- **FR-24 (MVP)** Gofer must recover safely from an expired sign-in, an
  abandoned sign-up, a missing permission or the wrong active workspace.

#### Learn And Certify

- **FR-25 (Next)** Gofer must offer the matching EAI training item at each step,
  for example the two-minute deploy video before the first deploy.
- **FR-26 (Next)** Training must play in the Code tab's Browser pane or open on
  a phone from a link or QR code.
- **FR-27 (Next)** Gofer must show progress on the proposed learning path: Level
  1 AI-Ready Consultant, Level 2 EAI App Builder and Level 3 EAI Certified
  Partner. Level 3 needs an approved assessment and fee.
- **FR-28 (Next)** When a person completes a level, Claude must offer a badge
  post. The person decides whether to post it.

#### Deploy, Run And Prove ROI

- **FR-29 (MVP)** Gofer must run the checked EAI deploy, confirm the app is live
  and keep the last good version live when a deploy fails.
- **FR-30 (Later)** The ROI model must include the EAI run cost when prices are
  approved. Until then, it shows a labelled placeholder.
- **FR-31 (Next)** A deployed app must record the agreed ROI measures. Gofer
  must produce a realised ROI report against the baseline.
- **FR-32 (Next)** Gofer must guide handover: client administrators, firm access
  and a support agreement.
- **FR-33 (MVP)** Gofer must produce adoption material for client staff: a
  one-page guide, a training plan and a team message.

#### Share And Grow

- **FR-34 (MVP)** After a first win, Claude must offer to draft a LinkedIn post
  with the person's referral link. The person edits and posts it. Gofer never
  posts or sends messages.
- **FR-35 (Later)** A referral must earn the approved reward. No reward applies
  before approval.
- **FR-36 (Later)** Certified firms must appear in an EAI partner directory by
  industry.
- **FR-37 (MVP)** Gofer must remove client names, client figures, confidential
  details and other firms' brands from a post draft before it shows the draft.

#### Firm And Enterprise

- **FR-38 (Next)** A Claude Team or Enterprise admin must be able to make Gofer
  available to all members in one step.
- **FR-39 (Later)** Staff at firms on Claude Team or Enterprise must be able to
  connect to the EAI connector through Enterprise Managed Auth (EMA). Depends on
  EPR-4 and EPR-5.
- **FR-40 (Later)** A firm admin must be able to turn EMA on or off and set the
  firm's identity provider in the EAI Admin Portal. Depends on EPR-6.
- **FR-41 (Next)** A firm view must show active consultants, outputs, apps
  built, apps live and learning progress.
- **FR-42 (Later)** A firm must be able to add its own methods to a private
  library that only its members can use.
- **FR-43 (MVP)** Gofer must provide a plain-language security and data-handling
  summary for firm and client questionnaires. Each answer must cite a published
  source.
- **FR-44 (MVP)** EAI must measure the GTM funnel: installs, first wins, shares,
  sign-ups, apps built, apps live and realised ROI reports. Measures must use no
  client content.

### Non-Functional Requirements

- **NFR-01 Privacy.** Client content stays in the user's Claude session and EAI
  workspace. The Gofer connector receives method names, counts and referral
  codes only.
- **NFR-02 Separation.** One client's workspace data is never visible to another
  client. A person joins only workspaces they are invited to.
- **NFR-03 Plain language.** All Gofer output follows Gofer's Controlled English
  rules.
- **NFR-04 Context budget.** The public skill description stays within Claude's
  listing budget. Playbooks load only when used.
- **NFR-05 Resume.** Multi-session work saves checkpoints and resumes at the
  last task.
- **NFR-06 Host coverage.** The consulting route and build pipeline work in
  Claude (chat, Cowork, Code tab), Codex and GitHub Copilot.
- **NFR-07 No invented facts.** Gofer checks EAI command syntax before use and
  labels unverified benchmarks.
- **NFR-08 Offline methods.** The consulting methods work when the Gofer
  connector is unavailable. Only counts and referral features stop.
- **NFR-09 Accessibility.** The landing page and training pages meet WCAG 2.1
  AA.

### EAI Platform Requests

These requests go to the EAI Platform team through the PublicAPI boundary. This
document does not describe how the platform meets them.

- **EPR-1** The website sign-up must accept a return address for Claude and
  return the user to it after the account is ready.
- **EPR-2** The account sign-up capability must accept requests only from an
  explicit list of approved sign-up surfaces.
- **EPR-3** A new company workspace must approve the EAI CLI as an app, so that
  a new user can deploy with no support request.
- **EPR-4** The EAI connector must use sign-in that follows the MCP
  authorisation specification.
- **EPR-5** The EAI sign-in service, or a token service in front of the
  connector, must accept EMA identity assertions. It must check each assertion
  against that firm's trusted list and add the person only to that firm's
  workspace.
- **EPR-6** The EAI Admin Portal must have a per-company EMA setting.
- **EPR-7** PublicAPI must publish a training catalogue with item links and
  completion status.
- **EPR-8** PublicAPI must let an app record and read named ROI measures.
- **EPR-9** All sign-up flows must be managed and tested as configuration code.
- **EPR-10** A firm administrator must be able to create a client workspace from
  the EAI Admin Portal and give other firm consultants a builder role in it. The
  MVP does not need this request: it uses the existing CLI capability.

### Key Entities

| Entity         | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| Firm           | A consulting firm. Owns one parent EAI company workspace.               |
| Consultant     | A member of the firm. Uses Claude and Gofer.                            |
| Client         | A firm's customer. Has one client workspace under the firm.             |
| Engagement     | A piece of consulting work for one client.                              |
| Opportunity    | A ranked AI or process change from a scan.                              |
| ROI case       | Baseline, benefits, costs, payback and assumptions for one opportunity. |
| App            | A process-improvement app that runs in a client workspace.              |
| ROI measure    | A named measure that the app records against the baseline.              |
| Referral code  | A code in a share link. Counts visits and installs.                     |
| Training item  | An EAI training video or page with a link.                              |
| Learning level | Level 1, 2 or 3 on the proposed path.                                   |

## Application Classification And Journey

This feature is mixed:

- The consulting route (groups A, B, E and G) is business consulting work. It
  needs no EAI workspace.
- The app route (groups C, D, F and H) is EAI app delivery. It runs Gofer's
  normal pipeline and EAI readiness checks.

`/eai` decides the route. The user does not choose a stage.

## Authentication Access Decision

- **Client apps:** workspace-only access by default (FR-23). A wider choice
  needs the firm's explicit answer, recorded in that app's specification.
- **Sign-in method for client apps:** EAI sign-in. Client single sign-on (SSO)
  through EAI is out of scope for this feature.
- **Firm staff to the EAI connector:** personal EAI sign-in now. EMA through the
  firm's identity provider later (FR-39).

## Capability Maturity And Validation Scope

| Capability                                                                  | Status                      | Evidence needed now                        |
| --------------------------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| `/eai` routing and consulting playbooks                                     | implemented (pending merge) | Unit tests and routing checks              |
| AI value playbooks (scan, bootcamp, redesign, capture, tracking, readiness) | implemented (pending merge) | Toolkit checks and sample outputs          |
| Industry packs                                                              | planned                     | Method review and sample outputs           |
| ROI model                                                                   | planned                     | Worked examples with known answers         |
| Code tab guidance                                                           | planned                     | Screenshots checked against Claude Desktop |
| Website sign-up guide                                                       | planned                     | Guided run with a new test account         |
| Client workspace deploy                                                     | planned                     | Deploy to a test client workspace          |
| Share post and post check                                                   | planned                     | Post check test cases                      |
| Gofer connector                                                             | not_applicable (Next)       | None in MVP                                |
| Training catalogue                                                          | not_applicable (Next)       | None in MVP                                |
| EMA                                                                         | not_applicable (Later)      | None in MVP                                |

## Success Criteria

### Measurable Outcomes

No numeric targets are approved. The owners set targets at the Phase 0 gate in
the [plan](plan.md).

| ID    | Outcome                    | Measure                                      | Target    |
| ----- | -------------------------- | -------------------------------------------- | --------- |
| SC-01 | People install from posts. | Installs per share                           | To be set |
| SC-02 | New users get value fast.  | Installs with a first output within 24 hours | To be set |
| SC-03 | Advice becomes apps.       | Opportunities that become builds             | To be set |
| SC-04 | Apps go live.              | Apps live on EAI (main number)               | To be set |
| SC-05 | Clients see ROI.           | Live apps with a realised ROI report         | To be set |
| SC-06 | Posts are safe.            | Posts with a client name or client figure    | Zero      |
| SC-07 | Clients stay separate.     | Access across client workspaces              | Zero      |

## Out Of Scope

- Prices, targets and market sizes.
- Automatic posting to LinkedIn or any network.
- Client SSO for client apps.
- A Gofer-built account sign-up that bypasses the EAI website. A direct
  `eai signup` command needs a separate product decision.

## Approval

| Role    | Decision | Date |
| ------- | -------- | ---- |
| Product | Pending  | -    |
| CEO     | Pending  | -    |

Implementation must not start before both approvals of the MVP scope are
recorded here with a date.
