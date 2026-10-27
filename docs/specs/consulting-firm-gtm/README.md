---
doc_id: consulting-firm-gtm.readme
title: Consulting Firm GTM
status: draft
owners:
  - EAI Product
  - EAI Growth
updated: 2026-10-27
---

# Consulting Firm GTM

This folder holds the end-to-end design for taking Gofer to consulting firms
with 1 to 250 people. These firms know their clients' industries. Their clients
know little about AI. The firms want to do excellent consulting work and find
ROI in those businesses.

**Status:** Draft. Product and CEO approval is pending. No implementation starts
before that approval is recorded in the [specification](spec.md#approval).

## In One Paragraph

Consultants install Gofer free in one click from a LinkedIn post. They use it to
find AI opportunities and prove ROI for a client. They build a
process-improvement prototype in the Code tab of Claude Desktop. They sign up
for EAI, deploy the app into a separate workspace for that client and measure
the realised ROI. Each win can become a post that brings new consultants. Firms
then roll Gofer out to all their staff, with company sign-in for larger firms.
EAI earns when apps run, and from training, partner and consulting fees.

## Documents

Read them in this order.

| Document                                       | What it answers                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [Customer and problem](discovery.md)           | Who is the customer? What problem do they have?                     |
| [50 business scenarios](business-scenarios.md) | How does each part of the GTM work for a real firm?                 |
| [Research evidence](research.md)               | Which facts does the design depend on, and how sure are we?         |
| [Specification](spec.md)                       | What must Gofer and the EAI Platform do?                            |
| [End-to-end design](design.md)                 | How do the parts fit together?                                      |
| [Decisions](decisions.md)                      | Which choices were made, and which were rejected?                   |
| [Delivery plan](plan.md)                       | In what order is the work done, and by whom?                        |
| [Traceability](traceability.md)                | Which scenario, design part and workstream covers each requirement? |
| [Delivery lineage](delivery-lineage.md)        | A diagram of the links from need to plan.                           |

## Related Work

- PR #441 adds the `/eai` consulting route and the 59 consulting playbooks that
  this design builds on. Six of them cover the AI value cycle: readiness,
  opportunity scan, bootcamp, workflow redesign, value capture and value
  tracking.
- EAI Platform requests (EPR-1 to EPR-10) in the [specification](spec.md) go to
  the EAI Platform team, which plans them separately.
