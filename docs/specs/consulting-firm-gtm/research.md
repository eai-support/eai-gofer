---
doc_id: consulting-firm-gtm.research
title: Consulting Firm GTM - Research Evidence
status: draft
owners:
  - EAI Product
updated: 2026-10-27
---

# Consulting Firm GTM - Research Evidence

This document records the facts that the [design](design.md) depends on. Each
finding has a confidence level. **Confirmed** means a primary source or the code
was checked. **Unconfirmed** means the design must not depend on it until it is
checked again.

## Claude Surfaces

### Plugins And The Slash Menu

- **Confirmed.** A Claude plugin is saved to the account. It is available in
  Claude chat, Cowork and Claude Code.
- **Confirmed.** Claude Code lists every user-invocable skill in the slash menu.
  A skill with `user-invocable: false` stays out of the menu but Claude can
  still load it.
- **Confirmed.** Claude loads only the skill name and description at start. The
  listing budget is about 1% of the context window. One description can use up
  to 1,536 characters. Claude reads the full skill only when it uses it.
- **Effect.** One public `/eai` entry with hidden consulting playbooks keeps the
  menu short and the context cost low.

### Claude Desktop Code Tab

- **Confirmed.** The Code tab in Claude Desktop runs Claude Code with no
  terminal. It needs a paid Claude plan.
- **Confirmed.** The user chooses the Local environment and opens a project
  folder. The user adds plugins from the `+` menu.
- **Confirmed.** The Code tab has Terminal, Changes, Browser and Files panes.
  The Browser pane can show a local app preview and can open a video link.
- **Effect.** A consultant can build and preview a prototype without a command
  line, and can watch EAI training next to the work.

### Directory Listing And Install Links

- **Confirmed.** Anthropic's directory lists plugins and connectors. The
  directory gives the publisher a usage report with installs, per-skill use and
  a funnel.
- **Confirmed.** A custom connector has a direct install link.
- **Unconfirmed.** The exact form of a deep link that opens one plugin listing
  in Claude. Check before the landing page ships.
- **Effect.** Each post can link straight to an install. Nobody needs to comment
  "Go" and wait for a direct message.

### Skills Served Over MCP

- **Unconfirmed.** The Model Context Protocol (MCP) proposal SEP-2640 serves
  skills from an MCP server. The public request for Claude support
  (anthropics/claude-ai-mcp issue 1160) was still open at the time of writing.
- **Confirmed.** Claude connectors support tool search, which loads tool
  definitions only when needed. Server instructions are limited to 4,096
  characters.
- **Effect.** The Gofer connector serves methods as tools and resources now. It
  can add the MCP skills format when Claude supports it. The design must not
  depend on that format.

### Enterprise Managed Auth

- **Confirmed.** Enterprise Managed Auth (EMA) lets Claude get a connector token
  from the firm's identity provider in one background step. The user sees no
  sign-in or consent screen.
- **Confirmed.** EMA uses an identity assertion (ID-JAG) and the JSON Web Token
  (JWT) bearer grant (RFC 7523). It works on Claude Team and Enterprise plans
  after an admin turns it on. It does not use dynamic client registration.
- **Confirmed.** Okta supports EMA through Cross App Access (XAA). A test
  playground exists at xaa.dev. Anthropic marks a directory listing as EMA-ready
  after review (contact: mcp-review@anthropic.com).
- **Unconfirmed.** Whether the EAI sign-in service can accept identity
  assertions from another company's identity provider. If it cannot, EAI needs a
  small token service in front of the connector.
- **Effect.** EMA serves the S3 enterprise path. It does not help S1 consultants
  on Claude Pro.

## EAI Platform At The PublicAPI Boundary

This repository is customer-side. It records EAI Platform facts only at the
PublicAPI boundary. Platform changes appear as EAI Platform requests (EPR) in
the [specification](spec.md).

### Account Sign-Up

- **Confirmed.** A new account starts on the EAI website. The website hands the
  user to the EAI Admin Portal, which uses the "create account" sign-in screen
  and then calls the PublicAPI account sign-up capability.
- **Confirmed.** The sign-up creates a company workspace. A repeated sign-up by
  the same person returns the same developer workspace.
- **Confirmed.** The EAI command-line interface (CLI) cannot create an account.
  `eai create` and `eai init` stop with "Complete Website signup first" when the
  user has no company workspace.
- **Gap.** The website sign-up does not return the user to Claude. The user must
  find their way back to the Gofer session.
- **Gap.** A new company workspace does not yet list the EAI CLI as an approved
  app. A new user may need support before the first deploy.
- **Effect.** Gofer guides the user to the website sign-up now (FR-20). The
  return to Claude and the CLI approval are platform requests EPR-1 and EPR-3.

### Sign-In

- **Confirmed.** `eai login` uses the EAI sign-in service with a browser and a
  local callback. `EAI_ACCESS_TOKEN` supports runs with no browser.
- **Confirmed.** `eai whoami` shows the signed-in user and workspaces.

### Workspaces

- **Confirmed (CLI 3.20.6 help).** The CLI can create a child workspace under a
  parent workspace. Creation of a new top-level workspace needs an explicit
  flag.
- **Confirmed.** An app has a scope workspace and a runtime target workspace.
- **Effect.** A firm can keep one parent workspace and one child workspace per
  client (FR-22). Gofer must check the exact commands with `eai --describe` and
  `--help` before it runs them.

### Deploy

- **Confirmed.** The EAI CLI deploys an app to EAI and checks that it is live.
- **Confirmed.** Gofer defaults app access to workspace members only.

## Market And Customer

- **Assumption.** Small and mid-sized consulting firms want an AI offer but lack
  developers. This needs customer interviews. See the validation plan in
  [plan](plan.md#validation-plan).
- **Assumption.** LinkedIn is the main reputation channel for the ICP.
- **Constraint (EAI rule).** Gofer drafts posts only and the person posts them.
  This keeps the person in control. It also keeps Gofer clear of the automated
  activity that LinkedIn's user agreement restricts. A LinkedIn sharing
  integration needs a separate decision.

## Open Questions

| ID  | Question                                                        | Owner               | Blocks           |
| --- | --------------------------------------------------------------- | ------------------- | ---------------- |
| Q1  | What is the deep link form for one plugin listing?              | EAI Growth          | FR-01            |
| Q2  | When will Claude support skills over MCP?                       | EAI Product         | Later phase only |
| Q3  | Can the EAI sign-in service accept identity assertions for EMA? | EAI Platform        | FR-39            |
| Q4  | Which Claude plans support plugins in chat?                     | EAI Growth          | FR-03            |
| Q5  | What are the EAI run prices for a client app?                   | EAI Product and CEO | FR-30            |
| Q6  | What reward does a referral earn?                               | EAI Growth and CEO  | FR-35            |
