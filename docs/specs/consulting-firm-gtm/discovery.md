---
doc_id: consulting-firm-gtm.discovery
title: Consulting Firm GTM - Customer And Problem
status: draft
owners:
  - EAI Product
  - EAI Growth
updated: 2026-10-27
---

# Consulting Firm GTM - Customer And Problem

This document defines who the go-to-market (GTM) serves and what problem it
solves. The [business scenarios](business-scenarios.md),
[specification](spec.md) and [design](design.md) build on it.

## Ideal Customer Profile

The ideal customer profile (ICP) is a consulting firm with 1 to 250 people.

- The firm knows one or more industries well, for example construction,
  healthcare clinics, local government, retail, manufacturing, logistics,
  agriculture or professional services.
- Its clients are small and mid-sized organisations. The clients know little
  about artificial intelligence (AI) and how to use it.
- The firm wants to do excellent consulting work. It wants to find and prove a
  return on investment (ROI) in the businesses it knows.
- The firm does not have software developers. It cannot build apps for clients
  today.
- The firm already uses Microsoft 365 or Google Workspace. Some consultants use
  Claude. LinkedIn is the main place where partners build their reputation.

## Problem Statement

Clients ask their consultants, "What should we do about AI?" Most small and
mid-sized firms cannot give a confident, industry-specific answer. They cannot
show the ROI in numbers that a non-technical executive trusts. When they find an
opportunity, they cannot build the process-improvement app that captures the
value. The work goes to larger firms or to software vendors, and the firm loses
the follow-on revenue.

## Why Now

- Clients expect AI advice from the advisers they already trust.
- Claude now runs plugins in Chat, Cowork and the Code tab of Claude Desktop. A
  consultant can build an app without a command line.
- Gofer already contains 64 consulting methods, nine of them for AI value, and
  an app delivery pipeline to the EAI Platform.

## Segments

| Segment          | Firm size        | Claude plan                     | Who buys                               | How they sign in                                                                | Main channel                              |
| ---------------- | ---------------- | ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| S1 Boutique      | 1 to 10 people   | Pro or Max, one seat per person | Managing partner, by card              | Personal EAI account                                                            | LinkedIn posts and referrals              |
| S2 Small firm    | 11 to 50 people  | Team                            | Managing partner with a practice lead  | EAI account per person; firm workspace                                          | LinkedIn, partner events, referrals       |
| S3 Mid-size firm | 51 to 250 people | Team or Enterprise              | Partner group, with IT and procurement | Company sign-in (Microsoft Entra ID or Okta) with Enterprise Managed Auth (EMA) | Partner programme, direct sales, LinkedIn |

## Personas

### P1 Managing Partner

- Owns revenue, brand and client relationships.
- Wants a credible AI offer without hiring a technology team.
- Decides on the purchase. Needs a clear cost and a clear client outcome.

### P2 Consultant

- Runs client engagements: diagnostics, process maps, business cases and
  roadmaps.
- Uses Claude every day. Has no coding background.
- Wants high-quality deliverables faster and a working prototype to show.

### P3 Practice Operations Or IT Lead

- Part-time IT in S1 and S2 firms. A dedicated IT team in S3 firms.
- Sets up Claude seats, plugins, company sign-in and the EAI workspace.
- Cares about client data separation, security questionnaires and cost control.

### P4 Client Executive

- A chief executive, chief financial officer, chief operating officer or
  operations manager at the client.
- Knows the business. Knows little about AI.
- Wants a low-risk change with an ROI that they can explain to their board.

### P5 Client Process Owner

- A team leader or staff member who uses the delivered app every day.
- Wants less manual work, fewer errors and a simple screen.

### P6 EAI Partner Success

- Runs training, certification and the partner directory for EAI.
- Wants firms to reach their first live client app fast.

## Jobs To Be Done

| ID  | Job                                                                                                                       | Main persona |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| J1  | Find the AI and process opportunities in a client's business, in that industry's language.                                | P2           |
| J2  | Put a number on the ROI: baseline, benefit, cost and payback.                                                             | P2, P4       |
| J3  | Deliver consulting outputs to a high standard: proposal, diagnostic, process map, business case, roadmap and change plan. | P2           |
| J4  | Turn a recommendation into a working process-improvement app, with no developers.                                         | P2           |
| J5  | Run the app safely for the client and earn recurring revenue.                                                             | P1, P3       |
| J6  | Prove the ROI after go-live.                                                                                              | P2, P4       |
| J7  | Build the firm's AI reputation and new-client pipeline.                                                                   | P1           |
| J8  | Bring every consultant in the firm up to the same standard.                                                               | P1, P3       |

## Goals

1. A consultant gets a first useful consulting output within one session of
   install.
2. A consultant can show a client a process-improvement prototype in the same
   week as the diagnostic.
3. A firm can run client apps on EAI with each client's data kept separate.
4. Each first win can become a LinkedIn post that brings new consultants to the
   plugin.
5. A firm can roll out Gofer to every consultant with one admin decision.

## Constraints

- The plugin is free. Revenue starts when apps run on EAI, plus training,
  partner and consulting fees. See [decisions](decisions.md).
- Claude drafts posts. The person decides whether to post. Gofer never posts or
  sends messages on its own.
- Posts never name a client or show client data.
- Gofer does not invent EAI commands, prices, targets or approvals.
- Account creation on EAI starts from the EAI website sign-up today.
- An app is open only to members of its EAI workspace unless the firm chooses
  otherwise.

## Assumptions

- **A1** The first audience is consultants and transformation leads on LinkedIn.
- **A2** The three-level AI consultant path is a proposal. No courses or fees
  exist yet.
- **A3** The plugin passes Anthropic's directory review.
- **A4** Firms will accept one EAI child workspace per client.
- **A5** Most S1 and S2 consultants prefer the Code tab of Claude Desktop to a
  terminal.

## Out Of Scope

- Prices, targets and market sizes. None are approved.
- Building a client's app for them in this feature. The feature gives firms the
  tools and the path.
- Automatic posting to LinkedIn or any other network.
