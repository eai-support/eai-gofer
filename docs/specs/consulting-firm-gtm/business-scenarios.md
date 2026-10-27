---
doc_id: consulting-firm-gtm.business-scenarios
title: Consulting Firm GTM - 50 Business Scenarios
status: draft
owners:
  - EAI Product
  - EAI Growth
updated: 2026-10-27
---

# Consulting Firm GTM - 50 Business Scenarios

These 50 scenarios show how the GTM works for a consulting firm with 1 to 250
people. The firm knows its clients' industry. Its clients know little about AI.
The [customer profile](discovery.md) defines the segments (S1 to S3) and
personas (P1 to P6). Each scenario links to requirements (FR) in the
[specification](spec.md) and, where the EAI Platform must change, to EAI
Platform requests (EPR).

## How To Read A Scenario

- **Who:** persona, segment and the firm's industry focus.
- **Trigger:** what starts the scenario.
- **Journey:** the main steps.
- **Outcome:** the result for the firm or its client.
- **Measure:** the number that shows it worked.
- **Needs:** linked requirements.
- **Acceptance:** the check that proves the scenario, in Given / When / Then
  form.

Scenarios marked **(edge)** cover a failure or exception path.

## Scenario Map

| Group                          | Scenarios      | Journey stage   | Main number      |
| ------------------------------ | -------------- | --------------- | ---------------- |
| A. Attract and install         | BS-01 to BS-07 | Free            | Installs         |
| B. First consulting win        | BS-08 to BS-16 | Free            | First wins       |
| C. Advice to app               | BS-17 to BS-24 | Free            | Apps built       |
| D. Account and workspace       | BS-25 to BS-31 | Paid on EAI     | Sign-ups         |
| E. Learn and certify           | BS-32 to BS-35 | Free, then paid | Levels completed |
| F. Deploy, run and prove ROI   | BS-36 to BS-41 | Paid on EAI     | Apps live        |
| G. Share and grow              | BS-42 to BS-45 | Free            | Shares           |
| H. Firm and enterprise rollout | BS-46 to BS-50 | Paid on EAI     | Firms active     |

## A. Attract And Install

### BS-01 A Peer's Win Post Leads To A One-Click Install

- **Who:** P1 Managing Partner, S1, construction advisory.
- **Trigger:** A peer posts on LinkedIn: "We mapped a builder's variation
  process and found 11 hours a week." The post has an "Add to Claude" link.
- **Journey:** Click the link -> the Gofer listing opens in Claude -> Install ->
  `/eai` shows the welcome.
- **Outcome:** The plugin is installed in less than two minutes. Nobody needs to
  comment "Go" and wait for a direct message.
- **Measure:** Referral link clicks to installs.
- **Needs:** FR-01, FR-02, FR-03, FR-04.
- **Acceptance:** Given a referral link, when a Claude Pro user opens it, then
  the Gofer listing opens and the install completes in Claude.

### BS-02 A Consultant Without The Right Claude Plan

- **Who:** P2 Consultant, S1, hospitality.
- **Trigger:** A consultant on a free Claude plan clicks a share link.
- **Journey:** The landing page shows which Claude plan each step needs -> the
  consultant chooses a plan or saves the link for later.
- **Outcome:** No dead end. The consultant knows what to do before install.
- **Measure:** Landing page exits by Claude plan.
- **Needs:** FR-03.
- **Acceptance:** Given a visitor without a paid plan, when the landing page
  loads, then it states the plan needed for chat skills and for the Code tab.
  The plan facts are checked against Anthropic's plan page at publish time.

### BS-03 A Consultant Finds Gofer In The Directory Search

- **Who:** P2 Consultant, S2, retail.
- **Trigger:** The consultant searches the Claude directory for "consulting".
- **Journey:** Search -> Gofer listing -> Install -> welcome.
- **Outcome:** Discovery without a referral.
- **Measure:** Organic installs from the directory usage report.
- **Needs:** FR-01.
- **Acceptance:** Given the published listing, when a user searches "consulting"
  or "business process", then Gofer appears with a plain-language description.

### BS-04 A Partner Installs From An Industry Event

- **Who:** P1 Managing Partner, S2, local government advisory.
- **Trigger:** An EAI speaker shows a QR code at an industry association event.
- **Journey:** Scan the QR code -> landing page -> "Send to my laptop" email
  link -> install in Claude Desktop.
- **Outcome:** The install is linked to the event.
- **Measure:** Installs per event code.
- **Needs:** FR-02, FR-03.
- **Acceptance:** Given an event code, when a user installs from the landing
  page, then the install is counted against that event and no personal data is
  stored.

### BS-05 A Firm That Builds In GitHub Copilot

- **Who:** P3 IT Lead, S2, manufacturing.
- **Trigger:** The firm builds in Visual Studio Code with GitHub Copilot, not in
  Claude.
- **Journey:** The landing page shows the Copilot install -> the consultant runs
  `/eai` in Visual Studio Code.
- **Outcome:** The firm uses the same Gofer pipeline in its own tools.
- **Measure:** Installs by host.
- **Needs:** FR-03, NFR-06.
- **Acceptance:** Given the Copilot install steps, when a user follows them,
  then `/eai` starts the same consulting route and build pipeline.

### BS-06 A New User Does Not Know Where To Start

- **Who:** P2 Consultant, S1, healthcare clinics.
- **Trigger:** The plugin is installed, but the consultant does not know what to
  ask.
- **Journey:** `/eai` asks for the client's industry -> offers three starters:
  scan a client for AI opportunities, build an ROI case, or show a prototype.
- **Outcome:** A first useful output in the first session.
- **Measure:** Installs that finish a first output within 24 hours.
- **Needs:** FR-04, FR-07.
- **Acceptance:** Given a first run, when the user names an industry, then Gofer
  offers three starters that use that industry pack.

### BS-07 A Careful Partner Checks Data Handling First

- **Who:** P1 Managing Partner, S3, financial services advisory.
- **Trigger:** The partner must protect client confidentiality.
- **Journey:** Read the plain-language data summary: what stays in Claude, what
  the Gofer connector receives, and what it never receives.
- **Outcome:** The partner approves the install for the firm.
- **Measure:** Data summary views to installs.
- **Needs:** FR-43, NFR-01.
- **Acceptance:** Given the data summary, when a reader checks it, then it
  states that client content never goes to the Gofer connector.

## B. First Consulting Win

### BS-08 AI Opportunity Scan For An Aged Care Provider

- **Who:** P2 Consultant, S1, aged care.
- **Trigger:** The client's chief executive asks, "What can AI do for us?"
- **Journey:** Paste anonymised interview notes and the rostering process ->
  `/eai` runs the AI opportunity scan with the aged care context -> ranked
  shortlist.
- **Outcome:** Five opportunities, each with value, effort, risk and data
  readiness, in plain language.
- **Measure:** Scans finished per active user.
- **Needs:** FR-07, FR-08, FR-10, FR-13.
- **Acceptance:** Given interview notes, when the scan runs, then each
  opportunity has a value, effort, risk and data readiness rating with labelled
  assumptions.

### BS-09 ROI Case For Missed Dental Appointments

- **Who:** P2 Consultant, S1, dental groups.
- **Trigger:** A dental group loses revenue to missed appointments.
- **Journey:** Enter the baseline from the client's numbers -> choose benefit
  drivers -> add costs -> Gofer calculates payback and a sensitivity range.
- **Outcome:** A spreadsheet and a one-page summary that a practice owner
  understands.
- **Measure:** ROI cases with every assumption labelled.
- **Needs:** FR-09, FR-10.
- **Acceptance:** Given a baseline and costs, when the model runs, then it shows
  payback, a low and high case, and a list of assumptions.

### BS-10 Process Map For Council Development Applications

- **Who:** P2 Consultant, S2, local government.
- **Trigger:** A council's development application intake takes too long.
- **Journey:** Map the current process -> mark delays and rework -> design the
  future process with AI help at each step.
- **Outcome:** A current and future process map in the firm's brand.
- **Measure:** Process maps finished.
- **Needs:** FR-05, FR-07, FR-11.
- **Acceptance:** Given a process description, when the map is produced, then it
  shows each step, owner, delay and the proposed AI change.

### BS-11 Proposal For A Manufacturing Diagnostic

- **Who:** P1 Managing Partner, S2, manufacturing.
- **Trigger:** A manufacturer asks for a proposal.
- **Journey:** `/eai` drafts the proposal with scope, method, timeline and
  outcomes -> the firm adds its own prices.
- **Outcome:** A proposal in the firm's template, ready to send.
- **Measure:** Proposals drafted.
- **Needs:** FR-05, FR-11.
- **Acceptance:** Given the firm's template, when Gofer drafts a proposal, then
  it uses that template and leaves prices for the firm.

### BS-12 Board Paper That Explains AI To Directors

- **Who:** P4 Client Executive, S2 firm, not-for-profit sector.
- **Trigger:** The board asks for an AI briefing.
- **Journey:** The consultant asks for a board paper -> Gofer writes it for
  non-technical directors, with a glossary, risks and governance questions.
- **Outcome:** Directors understand the choices and the risks.
- **Measure:** Client deliverables with a plain-language summary.
- **Needs:** FR-10.
- **Acceptance:** Given a board audience, when the paper is drafted, then each
  technical term has a plain definition and the summary fits on one page.

### BS-13 A Junior Consultant's Work Is Checked Before Review

- **Who:** P2 Consultant (junior), S3, logistics.
- **Trigger:** A junior consultant finishes a market scan.
- **Journey:** Gofer checks the work against the method checklist: complete, no
  overlaps, sources cited and assumptions labelled.
- **Outcome:** The partner spends less time on rework.
- **Measure:** Partner review rounds per deliverable.
- **Needs:** FR-12.
- **Acceptance:** Given a draft, when the quality check runs, then it lists each
  failed checklist item with a fix.

### BS-14 A Consultant Tries To Paste Patient Names (edge)

- **Who:** P2 Consultant, S1, healthcare clinics.
- **Trigger:** The consultant pastes a spreadsheet with patient names.
- **Journey:** Gofer detects personal data -> warns -> offers to anonymise
  before analysis.
- **Outcome:** Client personal data is not used without a decision.
- **Measure:** Warnings shown and accepted.
- **Needs:** FR-13, NFR-01.
- **Acceptance:** Given input with personal names, when the user asks for
  analysis, then Gofer warns and offers anonymisation first.

### BS-15 An Industry Without A Pack (edge)

- **Who:** P2 Consultant, S1, viticulture.
- **Trigger:** No industry pack exists for wine growers.
- **Journey:** Gofer uses the general pack -> asks five questions about the
  industry -> marks benchmarks as unverified.
- **Outcome:** Useful work without invented benchmarks.
- **Measure:** Outputs that use the general pack.
- **Needs:** FR-07, FR-42.
- **Acceptance:** Given an unknown industry, when Gofer gives a benchmark, then
  it labels the benchmark as unverified or cites a source.

### BS-16 A Three-Week Diagnostic Across Many Sessions

- **Who:** P2 Consultant, S3, logistics.
- **Trigger:** The diagnostic runs over three weeks.
- **Journey:** Gofer records the engagement -> saves a checkpoint each session
  -> resumes with the agreed outcome and next step.
- **Outcome:** No lost context between sessions.
- **Measure:** Engagements resumed without rework.
- **Needs:** FR-05, NFR-05.
- **Acceptance:** Given a saved engagement, when the consultant resumes, then
  Gofer states the agreed outcome and the next step.

## C. Advice To App

### BS-17 Moving From Chat To The Code Tab

- **Who:** P2 Consultant, S1, property management.
- **Trigger:** The scan is done in Claude chat. The consultant wants a
  prototype.
- **Journey:** Gofer shows four steps: open the Code tab -> choose Local -> open
  a project folder -> add the Gofer plugin.
- **Outcome:** The consultant builds with no command line.
- **Measure:** Chat users who start a build.
- **Needs:** FR-15.
- **Acceptance:** Given a finished scan in chat, when the user asks to build,
  then Gofer shows the Code tab steps with screenshots.

### BS-18 A Recommendation Becomes A Build Specification

- **Who:** P2 Consultant, S1, construction.
- **Trigger:** The client chooses "faster variation approvals".
- **Journey:** Gofer turns the chosen opportunity into a business scenario and
  specification. The ROI baseline becomes the success measure.
- **Outcome:** The app is built to deliver the ROI that was sold.
- **Measure:** Builds that carry an ROI measure.
- **Needs:** FR-14, FR-09.
- **Acceptance:** Given a chosen opportunity, when the spec is written, then it
  contains the baseline and target from the ROI case.

### BS-19 Prototype Of A Maintenance Request App

- **Who:** P2 Consultant, S1, property management.
- **Trigger:** The agency loses maintenance requests in email.
- **Journey:** Choose the intake and triage template -> Gofer builds -> preview
  in the Code tab's Browser pane. No EAI account is needed yet.
- **Outcome:** A clickable prototype for the client meeting.
- **Measure:** Time from spec to first preview.
- **Needs:** FR-16, FR-17.
- **Acceptance:** Given the template, when Gofer builds the prototype, then it
  runs locally and the preview check passes.

### BS-20 A Demo Pack For The Client Meeting

- **Who:** P2 Consultant, S2, retail.
- **Trigger:** The client meeting is tomorrow.
- **Journey:** Gofer makes screenshots, a three-minute walkthrough script and a
  before and after process map.
- **Outcome:** The client sees the change, not only a report.
- **Measure:** Demo packs made.
- **Needs:** FR-18.
- **Acceptance:** Given a running prototype, when the user asks for a demo pack,
  then it contains screenshots, a script and both process maps.

### BS-21 The Consultant Reaches A Claude Usage Limit (edge)

- **Who:** P2 Consultant, S1, accounting.
- **Trigger:** Claude stops mid-build because of a usage limit.
- **Journey:** Gofer has saved a checkpoint -> the consultant resumes later at
  the same task.
- **Outcome:** No lost work.
- **Measure:** Resumes after a stop.
- **Needs:** NFR-05.
- **Acceptance:** Given a stop mid-task, when the user resumes, then Gofer
  continues from the last checkpoint.

### BS-22 A Firm Builds In Codex

- **Who:** P3 IT Lead, S3, insurance.
- **Trigger:** The firm's builders use Codex.
- **Journey:** `$eai` in Codex runs the same pipeline.
- **Outcome:** One method, many tools.
- **Measure:** Builds by host.
- **Needs:** NFR-06.
- **Acceptance:** Given Codex, when the user runs `$eai`, then the build
  pipeline and checks match the Claude path.

### BS-23 The Client Asks For More Than The First Version (edge)

- **Who:** P4 Client Executive, S2 firm, wholesale distribution.
- **Trigger:** The client asks to connect the app to their finance system now.
- **Journey:** Gofer records the request as later scope -> explains the effect
  on time and ROI -> keeps the first version small.
- **Outcome:** The first version ships. The extra work becomes a paid next
  phase.
- **Measure:** First versions shipped on time.
- **Needs:** FR-14.
- **Acceptance:** Given a scope request, when it is outside the first version,
  then Gofer records it and states the effect on time and ROI.

### BS-24 A Claims Document Sorting Prototype

- **Who:** P2 Consultant, S2, insurance brokerage.
- **Trigger:** Staff sort claim documents by hand.
- **Journey:** Choose the document sorting template -> test with sample
  documents only -> preview.
- **Outcome:** The client sees AI sort their document types.
- **Measure:** Prototypes that use EAI AI services.
- **Needs:** FR-16, FR-13.
- **Acceptance:** Given sample documents, when the prototype runs, then it sorts
  them and uses no real client data.

## D. Account And Workspace

### BS-25 First Deploy With No EAI Account

- **Who:** P2 Consultant, S1, construction.
- **Trigger:** The client approves the prototype. The consultant wants it live.
- **Journey:** Gofer checks the EAI tools, sign-in and workspace -> finds no
  account -> opens the EAI website sign-up -> the consultant finishes it ->
  Gofer signs in and confirms the company workspace.
- **Outcome:** The consultant has an EAI company workspace and can deploy.
- **Measure:** Sign-ups started from Gofer that finish.
- **Needs:** FR-19, FR-20.
- **Acceptance:** Given no EAI account, when the user asks to deploy, then Gofer
  explains each missing step and resumes after sign-up.

### BS-26 Sign-Up Returns The User To Claude

- **Who:** P2 Consultant, S1, retail.
- **Trigger:** The consultant starts sign-up from Gofer.
- **Journey:** Website sign-up -> "Continue in Claude" -> the Gofer session
  resumes at the deploy step.
- **Outcome:** No lost place between the website and Claude.
- **Measure:** Time from sign-up start to first deploy.
- **Needs:** FR-21, EPR-1.
- **Acceptance:** Given sign-up started from Gofer, when it finishes, then the
  user returns to the same Gofer session.

### BS-27 A Separate Workspace For Each Client

- **Who:** P3 IT Lead, S2, construction.
- **Trigger:** The firm signs a second client.
- **Journey:** Gofer creates a client workspace under the firm's workspace ->
  deploys the client's app there.
- **Outcome:** Each client's data stays separate. The firm sees all its clients.
- **Measure:** Client workspaces per firm.
- **Needs:** FR-22, EPR-10.
- **Acceptance:** Given two clients, when both apps run, then neither client can
  see the other's data.

### BS-28 Client Staff Get Access To Their App Only

- **Who:** P3 IT Lead, S1, dental groups.
- **Trigger:** Six client staff need the app.
- **Journey:** Gofer asks who may use the app -> the default is workspace
  members only -> Gofer invites the six staff.
- **Outcome:** Only the client's team uses the app.
- **Measure:** Apps with workspace-only access.
- **Needs:** FR-23.
- **Acceptance:** Given an invited user and a user who is not invited, when both
  open the app, then only the invited user gets in.

### BS-29 Sign-In Expires During Deploy (edge)

- **Who:** P2 Consultant, S2, logistics.
- **Trigger:** The EAI sign-in expires mid-deploy.
- **Journey:** Gofer says what happened -> the consultant signs in again -> the
  deploy resumes.
- **Outcome:** No half-deployed app and no technical error text.
- **Measure:** Deploys that recover after sign-in.
- **Needs:** FR-24.
- **Acceptance:** Given an expired sign-in, when deploy runs, then Gofer stops
  safely and shows one plain next step.

### BS-30 Sign-Up Abandoned Halfway (edge)

- **Who:** P1 Managing Partner, S1, agriculture.
- **Trigger:** The partner stops sign-up halfway and returns two days later.
- **Journey:** Gofer detects the account without a workspace -> resumes sign-up
  -> no duplicate workspace.
- **Outcome:** One clean account and workspace.
- **Measure:** Duplicate workspaces (target: none).
- **Needs:** FR-24.
- **Acceptance:** Given a part-finished sign-up, when the user retries, then the
  platform returns the same workspace.

### BS-31 A Consultant Who Belongs To Two Firms (edge)

- **Who:** P2 Consultant, S1 contractor working for two firms.
- **Trigger:** The consultant has access to two firms' workspaces.
- **Journey:** Gofer shows the active workspace before deploy -> asks for
  confirmation -> deploys only there.
- **Outcome:** No app is deployed to the wrong firm.
- **Measure:** Deploys to the wrong workspace (target: none).
- **Needs:** FR-22, FR-24.
- **Acceptance:** Given two workspaces, when the user deploys, then Gofer names
  the target workspace and waits for confirmation.

## E. Learn And Certify

### BS-32 The Two-Minute Deploy Video At The Right Moment

- **Who:** P2 Consultant, S1, healthcare clinics.
- **Trigger:** The consultant is about to deploy for the first time.
- **Journey:** Gofer offers the EAI two-minute video, "Deploy your app to a
  container" -> it plays in the Code tab's Browser pane.
- **Outcome:** The consultant understands the deploy before it runs.
- **Measure:** Video starts and finishes at the deploy step.
- **Needs:** FR-06, FR-25, FR-26.
- **Acceptance:** Given a first deploy, when Gofer reaches the deploy step, then
  it offers the matching training item.

### BS-33 Watching Training On A Phone

- **Who:** P2 Consultant, S2, local government.
- **Trigger:** The consultant wants to learn on the train.
- **Journey:** Gofer gives a link and a QR code -> the video plays on the phone
  -> progress is saved after EAI sign-in.
- **Outcome:** Learning fits around client work.
- **Measure:** Training views on mobile.
- **Needs:** FR-26.
- **Acceptance:** Given a training item, when the user asks for mobile, then
  Gofer shows a link and a QR code.

### BS-34 Level 1 Complete And A Badge To Share

- **Who:** P2 Consultant, S1, hospitality.
- **Trigger:** The consultant finishes three consulting outputs and a short
  check.
- **Journey:** Gofer confirms Level 1, "AI-Ready Consultant" -> Claude drafts a
  badge post -> the consultant decides whether to post it.
- **Outcome:** Proof of skill, and one more share in the loop.
- **Measure:** Level 1 completions and badge shares.
- **Needs:** FR-27, FR-28, FR-34.
- **Acceptance:** Given Level 1 criteria are met, when Gofer confirms it, then
  it offers a badge post and never posts it automatically.

### BS-35 A Firm-Wide Training Plan

- **Who:** P3 Practice Operations Lead, S2, accounting.
- **Trigger:** The firm wants all 20 consultants at Level 1.
- **Journey:** The practice lead assigns Level 1 -> sees progress per
  consultant.
- **Outcome:** One consistent standard across the firm.
- **Measure:** Share of consultants at Level 1.
- **Needs:** FR-27, FR-41.
- **Acceptance:** Given an assigned level, when the lead opens the progress
  view, then it shows each consultant's status.

## F. Deploy, Run And Prove ROI

### BS-36 Guided Deploy Into The Client Workspace

- **Who:** P2 Consultant, S1, construction.
- **Trigger:** The account and client workspace are ready.
- **Journey:** Gofer runs the checked EAI deploy into the client workspace ->
  confirms the app is live -> gives the client link.
- **Outcome:** The client's app runs on EAI. Revenue starts.
- **Measure:** Apps live on EAI (main number).
- **Needs:** FR-29.
- **Acceptance:** Given a ready app, when deploy finishes, then the live check
  passes and Gofer shows the client link.

### BS-37 Run Cost In The ROI Model And Invoice

- **Who:** P1 Managing Partner, S2, retail.
- **Trigger:** The partner prices the ongoing service.
- **Journey:** Gofer adds the EAI run cost to the ROI model -> the partner adds
  the firm's margin.
- **Outcome:** An honest ROI and a profitable retainer.
- **Measure:** ROI cases that include run cost.
- **Needs:** FR-30, FR-09.
- **Acceptance:** Given approved EAI prices, when the ROI model runs, then it
  includes run cost. Before prices are approved, it shows a labelled
  placeholder.

### BS-38 Realised ROI After 90 Days

- **Who:** P4 Client Executive, S2 firm, construction.
- **Trigger:** The app has run for 90 days.
- **Journey:** The app has recorded the agreed measures -> Gofer compares them
  with the baseline -> writes a one-page ROI report.
- **Outcome:** The client sees proof, and the firm wins the next phase.
- **Measure:** Apps with a realised ROI report.
- **Needs:** FR-31.
- **Acceptance:** Given a baseline and 90 days of measures, when the report
  runs, then it shows the before, after and payback.

### BS-39 Client Staff Adopt The New Way Of Working

- **Who:** P5 Client Process Owner, S1 firm, dental groups.
- **Trigger:** The app goes live for reception staff.
- **Journey:** Gofer writes a one-page guide, a short training plan and a team
  message.
- **Outcome:** Staff use the app from the first week.
- **Measure:** Active client users in week one.
- **Needs:** FR-33.
- **Acceptance:** Given a live app, when the consultant asks for adoption
  material, then Gofer produces a guide, a plan and a message.

### BS-40 The Client Wants To Own The App

- **Who:** P4 Client Executive, S2 firm, manufacturing.
- **Trigger:** The client wants control of the app.
- **Journey:** The firm adds client administrators to the client workspace ->
  agrees a support retainer.
- **Outcome:** The client owns the app. The firm keeps a support role.
- **Measure:** Handovers with a support agreement.
- **Needs:** FR-32.
- **Acceptance:** Given a handover, when it finishes, then the client has an
  administrator and the firm's access matches the agreement.

### BS-41 A Deploy Fails After A Change (edge)

- **Who:** P2 Consultant, S2, logistics.
- **Trigger:** A new version fails to deploy.
- **Journey:** Gofer finds the cause -> keeps the last good version live ->
  explains the fix in plain language.
- **Outcome:** The client's service continues.
- **Measure:** Client downtime from failed deploys (target: none).
- **Needs:** FR-29.
- **Acceptance:** Given a failed deploy, when Gofer reports it, then the last
  good version is still live.

## G. Share And Grow

### BS-42 A First-Win Post With A Referral Link

- **Who:** P2 Consultant, S1, aged care.
- **Trigger:** The consultant finishes a first useful output.
- **Journey:** Claude offers to draft a post -> the post describes the win with
  no client name -> it has the consultant's referral link -> the consultant
  edits and posts it.
- **Outcome:** One more post in the loop.
- **Measure:** Posts per active user.
- **Needs:** FR-06, FR-34, FR-37.
- **Acceptance:** Given a first win, when Claude drafts the post, then it has a
  referral link and the consultant posts it.

### BS-43 The Post Check Removes A Client Name (edge)

- **Who:** P2 Consultant, S2, financial services advisory.
- **Trigger:** The draft includes a client name and a revenue figure.
- **Journey:** The post check finds both -> Gofer removes them before the
  consultant sees the draft.
- **Outcome:** No client confidentiality breach.
- **Measure:** Drafts changed by the post check.
- **Needs:** FR-37.
- **Acceptance:** Given a draft with a client name, when the check runs, then
  the shown draft has no client name or client figure.

### BS-44 Referral Count And Reward

- **Who:** P2 Consultant, S1, retail.
- **Trigger:** Three people install from the consultant's link.
- **Journey:** `/eai` shows the referral count -> the consultant gets the
  approved reward.
- **Outcome:** A reason to share again.
- **Measure:** Installs per share.
- **Needs:** FR-02, FR-06, FR-35.
- **Acceptance:** Given three referred installs, when the sharer asks, then
  Gofer shows three. The reward applies only after the programme is approved.

### BS-45 A Client Finds A Certified Partner

- **Who:** P4 Client Executive, not yet a client of any firm, agriculture.
- **Trigger:** The client searches for an AI adviser who knows farming.
- **Journey:** The EAI partner directory lists certified firms by industry ->
  the client contacts one.
- **Outcome:** New work for certified firms.
- **Measure:** Directory enquiries per partner.
- **Needs:** FR-36.
- **Acceptance:** Given a certified firm, when a client searches its industry,
  then the firm appears.

## H. Firm And Enterprise Rollout

### BS-46 One Admin Turns On Gofer For The Whole Firm

- **Who:** P3 IT Lead, S2, accounting.
- **Trigger:** The firm decides every consultant should use Gofer.
- **Journey:** The Claude Team admin adds Gofer for all members -> each
  consultant sees one `/eai` command.
- **Outcome:** Thirty consultants switched on in one step.
- **Measure:** Firms switched on and active staff per firm.
- **Needs:** FR-38.
- **Acceptance:** Given an admin install, when a member opens Claude, then Gofer
  is available without a personal install.

### BS-47 Staff Connect With Company Sign-In

- **Who:** P3 IT Lead, S3, engineering services, on Claude Enterprise and
  Microsoft Entra ID.
- **Trigger:** The firm does not want a second sign-in for 180 staff.
- **Journey:** IT turns on Enterprise Managed Auth (EMA) for the EAI connector
  -> staff connect with company sign-in -> EAI adds each person to the firm's
  workspace on first connect.
- **Outcome:** No EAI sign-in screen. Each person reaches only their firm's
  workspace.
- **Measure:** Staff connected through EMA.
- **Needs:** FR-39, FR-40, EPR-4, EPR-5, EPR-6.
- **Acceptance:** Given EMA is on, when a staff member connects, then no sign-in
  screen shows and they join only their firm's workspace.

### BS-48 A Client's Security Questionnaire

- **Who:** P3 IT Lead, S3, healthcare.
- **Trigger:** A hospital client sends a security questionnaire.
- **Journey:** Gofer produces the security and data-handling summary: data
  flows, workspace separation, sign-in and hosting region.
- **Outcome:** The firm answers in days, not weeks.
- **Measure:** Questionnaires answered from the pack.
- **Needs:** FR-43.
- **Acceptance:** Given the security pack, when IT reads it, then each answer
  cites a published EAI or Anthropic source.

### BS-49 The Firm Adds Its Own Methods

- **Who:** P1 Managing Partner, S3, mining services.
- **Trigger:** The firm has its own safety diagnostic method.
- **Journey:** The firm adds the method to its private library -> consultants
  use it through `/eai` next to the Gofer methods.
- **Outcome:** The firm's know-how scales across its staff.
- **Measure:** Firm methods used per month.
- **Needs:** FR-42.
- **Acceptance:** Given a firm method, when a consultant in that firm runs
  `/eai`, then the method is available. Other firms cannot see it.

### BS-50 The Managing Partner Reviews Results

- **Who:** P1 Managing Partner, S3, professional services.
- **Trigger:** The quarterly partner meeting.
- **Journey:** The firm view shows active consultants, outputs, apps built, apps
  live and realised ROI.
- **Outcome:** The partners decide to expand the AI practice.
- **Measure:** Firms that expand seats or client apps.
- **Needs:** FR-41, FR-44.
- **Acceptance:** Given a quarter of use, when the partner opens the firm view,
  then it shows the five GTM numbers for the firm.

## Coverage Check

| Segment              | Scenarios                                                                              |
| -------------------- | -------------------------------------------------------------------------------------- |
| S1 Boutique          | 01, 02, 06, 08, 09, 14, 15, 17, 18, 19, 21, 25, 26, 28, 30, 31, 32, 34, 36, 39, 42, 44 |
| S2 Small firm        | 03, 04, 05, 10, 11, 12, 20, 23, 24, 27, 29, 33, 35, 37, 38, 40, 41, 43, 46             |
| S3 Mid-size firm     | 07, 13, 16, 22, 47, 48, 49, 50                                                         |
| Client side (P4, P5) | 12, 23, 38, 39, 40, 45                                                                 |

- Edge and failure paths: BS-14, BS-15, BS-21, BS-23, BS-29, BS-30, BS-31,
  BS-41, BS-43.
- Every FR in the [specification](spec.md) has at least one scenario. The
  [traceability matrix](traceability.md) shows the links.
