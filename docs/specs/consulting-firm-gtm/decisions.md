---
doc_id: consulting-firm-gtm.decisions
title: Consulting Firm GTM - Decisions
status: draft
owners:
  - EAI Product
updated: 2026-10-27
---

# Consulting Firm GTM - Decisions

Each decision states the choice, who directed it, the reason and the effect.
**Human-directed** means the user chose it in the design conversation.
**Agent-initiated** means Gofer proposed it for review. No decision here has
formal Product and CEO approval yet. See [Approval](spec.md#approval).

## D1 Business Model

### Selected Approach: Free Plugin, Paid When Apps Run

The Gofer plugin is free. EAI earns from apps that run on EAI, from training and
certification, from partner fees and from consulting help.

- **Origin:** Human-directed, 2026-10-26.
- **Why:** A free install lets the LinkedIn loop spread with no buying step. The
  value to EAI starts when a client app runs.
- **Effect:** The MVP must make the path from advice to a live app short. Prices
  are not set. FR-30 shows a placeholder until they are.

### Rejected Alternative: Paid Plugin Subscription

- **Why not:** A price at install stops the loop at its first step. It also
  charges consultants before they see value.

## D2 How Consultants Reach The Methods

### Selected Approach: One Public Command With Playbooks On Demand

`/eai` is the only public command. The 53 consulting playbooks load only when a
request needs them and stay out of the slash menu. A Gofer connector serves the
methods to Claude chat and Cowork in the Next release.

- **Origin:** Human-directed, 2026-10-26. The user asked for a short menu.
- **Why:** The menu stays clean. Claude reads one description at start, so the
  context cost stays low.
- **Effect:** The `/eai` description must route every consulting request well.
  The routing tests in this repository protect it.

### Rejected Alternative: 53 Separate Public Skills

- **Why not:** The slash menu becomes long and hard to use. Each description
  also uses part of Claude's skill listing budget.

### Rejected Alternative: Depend On Skills Over MCP Now

- **Why not:** Claude support for the MCP skills format was not confirmed at the
  time of writing. The connector can add it later with no change for users.

## D3 How People Install From A Post

### Selected Approach: Direct Install Link, Person Posts

Each post links to the Gofer landing page and the directory listing. The person
installs in one step. After a first win, Claude drafts a post and the person
decides whether to post it.

- **Origin:** Human-directed, 2026-10-26.
- **Why:** No waiting for a reply. Each install can be counted. The person stays
  in control of what is posted.
- **Effect:** FR-01, FR-02, FR-34 and FR-37.

### Rejected Alternative: Comment "Go" To Receive It

- **Why not:** It needs a manual reply for each person. It is slow and gives no
  install count.

### Rejected Alternative: Automatic Posting

- **Why not:** It removes the person's control and risks client confidentiality.
  It also risks LinkedIn's rules on automated activity.

## D4 Referral Counting In The MVP

### Selected Approach: Landing Page Referral Code First

The MVP counts visits per referral code on a static landing page. The directory
usage report counts installs. The Gofer connector links codes to installs in the
Next release.

- **Origin:** Agent-initiated, 2026-10-27.
- **Why:** The loop can start with no new server. This is the 80:20 path.
- **Effect:** MVP referral counts are visits, not installs. Rewards wait for
  install counts and for an approved programme (FR-35).

### Rejected Alternative: Build The Connector Before Launch

- **Why not:** It delays the loop for a feature that only improves counting.

## D5 Account Sign-Up

### Selected Approach: Guide To The Website Sign-Up Now

Gofer opens the EAI website sign-up, explains each step and resumes when the
person returns. It asks the EAI Platform for a return link to Claude (EPR-1) and
for CLI approval in new workspaces (EPR-3).

- **Origin:** Agent-initiated, 2026-10-27, after review of the current sign-up
  path.
- **Why:** It works with today's platform and keeps the website sign-up checks.
- **Effect:** The person leaves Claude once. FR-20 now, FR-21 later.

### Rejected Alternative: A Gofer Sign-Up Command Now

- **Why not:** It needs a product decision and new platform controls (EPR-2). It
  would also skip the website's sign-up checks.

## D6 Firm And Client Workspaces

### Selected Approach: Firm Parent Workspace With One Child Per Client

Each firm has one parent workspace. Each client has a child workspace under it.
Client apps default to workspace-only access.

- **Origin:** Agent-initiated, 2026-10-27.
- **Why:** Each client's data stays separate. The firm still sees all its
  clients in one place. Handover to the client is simple.
- **Effect:** FR-22, FR-23 and EPR-10. Gofer confirms the target workspace
  before each deploy.

### Rejected Alternative: One Shared Workspace For All Clients

- **Why not:** One mistake could show a client another client's data.

### Rejected Alternative: A Separate Account For Each Client

- **Why not:** The firm loses one view of its clients, and each client needs a
  new sign-up.

## D7 Where Consultants Build

### Selected Approach: The Code Tab In Claude Desktop

The default build path is the Code tab in Claude Desktop. The terminal, Codex
and GitHub Copilot stay available.

- **Origin:** Human-directed, 2026-10-26.
- **Why:** Most consultants do not use a command line. The Code tab also shows
  the preview and training in its Browser pane.
- **Effect:** FR-15 and FR-26.

### Rejected Alternative: Terminal-Only Build Path

- **Why not:** It stops most of the ICP at the first step of the build.

## D8 Enterprise Sign-In

### Selected Approach: Enterprise Managed Auth In A Later Phase

Firms on Claude Team or Enterprise connect through EMA after the MVP. This
depends on a check of the EAI sign-in service (research question Q3).

- **Origin:** Human-directed, 2026-10-27, to add the enterprise path.
- **Why:** EMA serves S3 firms. It does not help S1 consultants, who are the
  first audience.
- **Effect:** FR-39, FR-40 and EPR-4 to EPR-6.

### Rejected Alternative: EMA In The MVP

- **Why not:** It needs platform work that is not yet confirmed, for a segment
  that is not the first audience.

## D9 Documentation Boundary

### Selected Approach: Stop At The PublicAPI Boundary

This repository is customer-side. These documents describe EAI Platform needs as
PublicAPI capabilities and EAI Platform requests. They do not describe platform
internals.

- **Origin:** Agent-initiated, 2026-10-27, from the Gofer documentation rules.
- **Why:** Gofer documents may reach customers.
- **Effect:** The EAI Platform team turns each request into its own plan.

## D10 Delivery Order

### Selected Approach: An MVP That Needs No New Platform Work

Phase 1 uses only what the EAI Platform supports today. The EAI Platform
requests run in parallel and unlock Phases 2 and 3.

- **Origin:** Agent-initiated, 2026-10-27, as the 80:20 MVP scope for approval.
- **Why:** The loop and the first client apps can start without waiting for
  another team.
- **Effect:** The MVP uses the website sign-up guide, landing page referral
  codes and personal EAI sign-in. See the [plan](plan.md#phases).

### Rejected Alternative: Wait For The Platform Requests Before Launch

- **Why not:** It delays every number in the GTM for features that only improve
  the experience.
