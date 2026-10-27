---
doc_id: consulting-firm-gtm.traceability
title: Consulting Firm GTM - Traceability
status: draft
owners:
  - EAI Product
updated: 2026-10-27
---

# Consulting Firm GTM - Traceability

This matrix links each requirement in the [specification](spec.md) to its
[business scenarios](business-scenarios.md), its part of the [design](design.md)
and its workstream in the [plan](plan.md). Every requirement has at least one
scenario and one workstream.

## Requirements

| Requirement | Priority       | Summary                                                                                                                  | Scenarios                  | Design                                                                                                                               | Workstream |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| FR-01       | MVP            | Gofer must be listed in Anthropic's plugin directory                                                                     | BS-01, BS-03               | [Landing Page And Referral Code](design.md#landing-page-and-referral-code)                                                           | W1         |
| FR-02       | MVP, then Next | Each share link must carry a referral code                                                                               | BS-01, BS-04, BS-44        | [Landing Page And Referral Code](design.md#landing-page-and-referral-code), [Gofer Connector (Next)](design.md#gofer-connector-next) | W1, W8     |
| FR-03       | MVP            | A landing page must explain, in plain language, what Gofer does, which Claude plan each step needs, and how to ...       | BS-01, BS-02, BS-04, BS-05 | [Landing Page And Referral Code](design.md#landing-page-and-referral-code)                                                           | W1         |
| FR-04       | MVP            | The first `/eai` run must ask for the client's industry and offer three starters: scan for AI opportunities, build ...   | BS-01, BS-06               | [Gofer Plugin](design.md#gofer-plugin), [Industry Packs](design.md#industry-packs)                                                   | W2         |
| FR-05       | MVP            | `/eai` must be the only public command                                                                                   | BS-10, BS-11, BS-16        | [Gofer Plugin](design.md#gofer-plugin)                                                                                               | Phase 0    |
| FR-06       | Next           | A Gofer connector (MCP server) must serve the method catalogue, the share post and referral link, the training ...       | BS-32, BS-42, BS-44        | [Gofer Connector (Next)](design.md#gofer-connector-next)                                                                             | W8         |
| FR-07       | MVP            | Industry packs must give industry terms, typical processes, key measures and sourced benchmarks                          | BS-06, BS-08, BS-10, BS-15 | [Industry Packs](design.md#industry-packs)                                                                                           | W2         |
| FR-08       | MVP            | An AI opportunity scan must turn notes, process descriptions or documents into a ranked list                             | BS-08                      | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W3         |
| FR-09       | MVP            | An ROI model must give baseline, benefit drivers, costs, payback and a low and high case                                 | BS-09, BS-18, BS-37        | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W3         |
| FR-10       | MVP            | Every client deliverable must start with a plain-language summary for a reader who knows little about AI, with a ...     | BS-08, BS-09, BS-12        | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W3         |
| FR-11       | MVP            | Deliverables must use the firm's brand template when one is set                                                          | BS-10, BS-11               | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W7         |
| FR-12       | MVP            | Gofer must check each deliverable against its method checklist before handover: complete, no overlaps, sources cited ... | BS-13                      | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W3         |
| FR-13       | MVP            | Gofer must warn before it uses personal data in client input and must offer to anonymise it                              | BS-08, BS-14, BS-24        | [Data Handling](design.md#data-handling), [Failure Handling](design.md#failure-handling)                                             | W3         |
| FR-14       | MVP            | A chosen opportunity must become a Gofer business scenario and specification                                             | BS-18, BS-23               | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks), [Deploy, Run And ROI](design.md#deploy-run-and-roi)            | W4         |
| FR-15       | MVP            | Gofer must show how to move from Claude chat to the Code tab in Claude Desktop: open the Code tab, choose Local, ...     | BS-17                      | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks), [End-To-End Journey](design.md#end-to-end-journey)             | W4         |
| FR-16       | MVP, then Next | Gofer must offer process-improvement app templates                                                                       | BS-19, BS-24               | [Deploy, Run And ROI](design.md#deploy-run-and-roi)                                                                                  | W4, W9     |
| FR-17       | MVP            | A consultant must be able to build and preview a prototype locally before they have an EAI account                       | BS-19                      | [End-To-End Journey](design.md#end-to-end-journey)                                                                                   | W4         |
| FR-18       | MVP            | Gofer must produce a client demo pack: screenshots, a short walkthrough script and before and after process maps         | BS-20                      | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W4         |
| FR-19       | MVP            | Before deploy, Gofer must check the EAI CLI, sign-in and company workspace                                               | BS-25                      | [Sign-Up Now](design.md#sign-up-now)                                                                                                 | W5         |
| FR-20       | MVP            | When there is no account, Gofer must open the EAI website sign-up, explain the steps and resume with sign-in when ...    | BS-25                      | [Sign-Up Now](design.md#sign-up-now)                                                                                                 | W5         |
| FR-21       | Later          | The website sign-up must return the user to the Gofer session                                                            | BS-26                      | [Sign-Up Later](design.md#sign-up-later)                                                                                             | W15        |
| FR-22       | MVP            | Gofer must deploy each client's app into a client workspace under the firm's workspace                                   | BS-27, BS-31               | [Firm And Client Workspaces](design.md#firm-and-client-workspaces)                                                                   | W5         |
| FR-23       | MVP            | Client apps must default to workspace-only access                                                                        | BS-28                      | [Firm And Client Workspaces](design.md#firm-and-client-workspaces)                                                                   | W5         |
| FR-24       | MVP            | Gofer must recover safely from an expired sign-in, an abandoned sign-up, a missing permission or the wrong active ...    | BS-29, BS-30, BS-31        | [Failure Handling](design.md#failure-handling)                                                                                       | W5         |
| FR-25       | Next           | Gofer must offer the matching EAI training item at each step, for example the two-minute deploy video before the ...     | BS-32                      | [Learn And Certify](design.md#learn-and-certify)                                                                                     | W10        |
| FR-26       | Next           | Training must play in the Code tab's Browser pane or open on a phone from a link or QR code                              | BS-32, BS-33               | [Learn And Certify](design.md#learn-and-certify)                                                                                     | W10        |
| FR-27       | Next           | Gofer must show progress on the proposed learning path: Level 1 AI-Ready Consultant, Level 2 EAI App Builder and ...     | BS-34, BS-35               | [Learn And Certify](design.md#learn-and-certify)                                                                                     | W10        |
| FR-28       | Next           | When a person completes a level, Claude must offer a badge post                                                          | BS-34                      | [Learn And Certify](design.md#learn-and-certify), [Share Post And Post Check](design.md#share-post-and-post-check)                   | W10        |
| FR-29       | MVP            | Gofer must run the checked EAI deploy, confirm the app is live and keep the last good version live when a deploy fails   | BS-36, BS-41               | [Deploy, Run And ROI](design.md#deploy-run-and-roi), [Failure Handling](design.md#failure-handling)                                  | W5         |
| FR-30       | Later          | The ROI model must include the EAI run cost when prices are approved                                                     | BS-37                      | [Deploy, Run And ROI](design.md#deploy-run-and-roi)                                                                                  | W16        |
| FR-31       | Next           | A deployed app must record the agreed ROI measures                                                                       | BS-38                      | [Deploy, Run And ROI](design.md#deploy-run-and-roi)                                                                                  | W11        |
| FR-32       | Next           | Gofer must guide handover: client administrators, firm access and a support agreement                                    | BS-40                      | [Firm And Client Workspaces](design.md#firm-and-client-workspaces)                                                                   | W11        |
| FR-33       | MVP            | Gofer must produce adoption material for client staff: a one-page guide, a training plan and a team message              | BS-39                      | [Reuse Of Existing Playbooks](design.md#reuse-of-existing-playbooks)                                                                 | W5         |
| FR-34       | MVP            | After a first win, Claude must offer to draft a LinkedIn post with the person's referral link                            | BS-34, BS-42               | [Share Post And Post Check](design.md#share-post-and-post-check)                                                                     | W3         |
| FR-35       | Later          | A referral must earn the approved reward                                                                                 | BS-44                      | [Gofer Connector (Next)](design.md#gofer-connector-next)                                                                             | W17        |
| FR-36       | Later          | Certified firms must appear in an EAI partner directory by industry                                                      | BS-45                      | [Learn And Certify](design.md#learn-and-certify)                                                                                     | W17        |
| FR-37       | MVP            | Gofer must remove client names, client figures, confidential details and other firms' brands from a post draft ...       | BS-42, BS-43               | [Share Post And Post Check](design.md#share-post-and-post-check)                                                                     | W3         |
| FR-38       | Next           | A Claude Team or Enterprise admin must be able to make Gofer available to all members in one step                        | BS-46                      | [Enterprise Rollout And EMA](design.md#enterprise-rollout-and-ema)                                                                   | W12        |
| FR-39       | Later          | Staff at firms on Claude Team or Enterprise must be able to connect to the EAI connector through Enterprise Managed ...  | BS-47                      | [Enterprise Rollout And EMA](design.md#enterprise-rollout-and-ema)                                                                   | W14        |
| FR-40       | Later          | A firm admin must be able to turn EMA on or off and set the firm's identity provider in the EAI Admin Portal             | BS-47                      | [Enterprise Rollout And EMA](design.md#enterprise-rollout-and-ema)                                                                   | W14        |
| FR-41       | Next           | A firm view must show active consultants, outputs, apps built, apps live and learning progress                           | BS-35, BS-50               | [Measurement](design.md#measurement)                                                                                                 | W12        |
| FR-42       | Later          | A firm must be able to add its own methods to a private library that only its members can use                            | BS-15, BS-49               | [Industry Packs](design.md#industry-packs)                                                                                           | W18        |
| FR-43       | MVP            | Gofer must provide a plain-language security and data-handling summary for firm and client questionnaires                | BS-07, BS-48               | [Data Handling](design.md#data-handling), [Landing Page And Referral Code](design.md#landing-page-and-referral-code)                 | W1         |
| FR-44       | MVP            | EAI must measure the GTM funnel: installs, first wins, shares, sign-ups, apps built, apps live and realised ROI reports  | BS-50                      | [Measurement](design.md#measurement)                                                                                                 | W6         |

## EAI Platform Requests

| Request | Requirements | Scenarios                  | Phase   |
| ------- | ------------ | -------------------------- | ------- |
| EPR-1   | FR-21        | BS-26                      | Phase 2 |
| EPR-2   | FR-20, FR-21 | BS-25, BS-26               | Phase 2 |
| EPR-3   | FR-19, FR-29 | BS-25, BS-36, BS-41        | Phase 2 |
| EPR-4   | FR-06, FR-39 | BS-32, BS-42, BS-44, BS-47 | Phase 2 |
| EPR-5   | FR-39        | BS-47                      | Phase 3 |
| EPR-6   | FR-40        | BS-47                      | Phase 3 |
| EPR-7   | FR-25        | BS-32                      | Phase 2 |
| EPR-8   | FR-31        | BS-38                      | Phase 3 |
| EPR-9   | FR-20        | BS-25                      | Phase 2 |
| EPR-10  | FR-22        | BS-27, BS-31               | Phase 2 |

## Decisions

| Decision                                                | Choice                                          | Requirements               |
| ------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| [D1](decisions.md#d1-business-model)                    | Free plugin, paid when apps run                 | FR-30, FR-35, FR-36        |
| [D2](decisions.md#d2-how-consultants-reach-the-methods) | One public command with playbooks on demand     | FR-05, FR-06               |
| [D3](decisions.md#d3-how-people-install-from-a-post)    | Direct install link, person posts               | FR-01, FR-02, FR-34, FR-37 |
| [D4](decisions.md#d4-referral-counting-in-the-mvp)      | Landing page referral code first                | FR-02                      |
| [D5](decisions.md#d5-account-sign-up)                   | Guide to the website sign-up now                | FR-19, FR-20, FR-21        |
| [D6](decisions.md#d6-firm-and-client-workspaces)        | Firm parent workspace with one child per client | FR-22, FR-23, FR-32        |
| [D7](decisions.md#d7-where-consultants-build)           | The Code tab in Claude Desktop                  | FR-15, FR-17, FR-26        |
| [D8](decisions.md#d8-enterprise-sign-in)                | Enterprise Managed Auth in a later phase        | FR-39, FR-40               |
| [D9](decisions.md#d9-documentation-boundary)            | Stop at the PublicAPI boundary                  | All EPR items              |
| [D10](decisions.md#d10-delivery-order)                  | An MVP that needs no new platform work          | All MVP items              |

## Success Criteria

| Criterion                                   | Scenarios that prove it |
| ------------------------------------------- | ----------------------- |
| SC-01 Installs per share                    | BS-01, BS-42, BS-44     |
| SC-02 First output within 24 hours          | BS-06, BS-08            |
| SC-03 Opportunities that become builds      | BS-17, BS-18, BS-19     |
| SC-04 Apps live on EAI                      | BS-25, BS-27, BS-36     |
| SC-05 Live apps with a realised ROI report  | BS-38                   |
| SC-06 Posts with client information: zero   | BS-42, BS-43            |
| SC-07 Access across client workspaces: zero | BS-27, BS-28, BS-31     |
