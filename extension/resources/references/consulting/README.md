# Consultant Toolkit: Business Consulting Agent Skills

Fifty-nine single-purpose business consulting skills that take a client
engagement from the first proposal to an adopted change: the 50 core skills,
three engagement skills (`engagement-proposal`, `process-mapping`, and
`status-report`), and six AI value skills that find, prove, and capture the
return on AI. Each skill owns exactly one output, so you can combine any of them
without duplicated work. The same files run on Claude and OpenAI products.

These are business consulting skills, not app development skills. They use
client-engagement language and contain no software delivery steps. The validator
rejects software delivery terms such as sprint, backlog, or deployment.

## In Gofer

Gofer ships these skills on every surface it supports: Claude, Codex, Copilot,
Grok, and VS Code. Use `/eai` (or `$eai` in Codex) as usual. When a request is
business consulting with nothing to build, Gofer routes it to the right skill
and skips app setup. [`routing.md`](routing.md) holds the route test, the owner
table that keeps the non-app path MECE with Gofer's own functions, and the map
from Gofer's numbered stages to these skills. The skills stay out of the host
skill pickers, so `eai` remains the only public command.

## How the set stays MECE

- **One skill, one output.** The catalog below names the one output each skill
  owns. No two skills own the same output. The validator enforces this.
- **Eight phases.** Phases 1 to 7 follow engagement order. Phase 8 is the AI
  value cycle, which an engagement can add whenever AI is in scope. Each phase
  answers one question. Inside a phase, skills split on a single rule (shown in
  each heading).
- **Explicit hand-offs.** Each skill lists what it is not for and which skill to
  use instead, so a request reaches one owner.
- **Additive outputs.** All skills use the same labels: `[Assumption]`,
  `[Estimate]`, `[Unverified]`, and inline sources. One skill's output is the
  next skill's input.
- **One owner for shared elements.** `insight-synthesis` owns the one-line
  answer. `chart-selection` owns chart encoding. `visual-consistency` owns
  deck-wide number and term rules. `recommendation-deck` decides what goes to
  the appendix. Other skills reuse these outputs; they do not redo them.

```mermaid
flowchart LR
  A[1 Frame] --> B[2 Gather evidence] --> C[3 Analyze]
  C --> D[4 Quantify] --> E[5 Synthesize and storyline]
  E --> F[6 Build exhibits and slides] --> G[7 Implement and govern]
  B -.-> E
  C -.-> E
  C -.-> H[8 AI value] -.-> G
```

## Catalog

### 1. Frame: what will we deliver, what must we solve, and for whom?

Split: engagement terms, question, audience, structure, test plan, and a
structure audit.

| #   | Skill                 | Owns (one output)                                                    |
| --- | --------------------- | -------------------------------------------------------------------- |
| 1   | `engagement-proposal` | Proposal or statement of work with scope, team, timeline, and fees   |
| 2   | `problem-framing`     | Problem statement with the key question, scope, and success criteria |
| 3   | `audience-brief`      | Audience profile for one deliverable                                 |
| 4   | `issue-tree`          | Logic tree of sub-questions                                          |
| 5   | `hypothesis-map`      | Hypothesis-driven workplan                                           |
| 6   | `mece-check`          | Overlap and gap audit of an existing structure                       |

### 2. Gather evidence: what do the facts say?

Split: by source type. Rate sources first, then synthesize each type.

| #   | Skill                 | Owns (one output)                                      |
| --- | --------------------- | ------------------------------------------------------ |
| 7   | `source-validation`   | Source credibility log                                 |
| 8   | `research-synthesis`  | Findings from secondary (desk) sources                 |
| 9   | `interview-synthesis` | Themes from interviews, expert calls, and focus groups |
| 10  | `survey-analysis`     | Results from questionnaire data                        |

### 3. Analyze: where do we stand, and where could we go?

Split: outside-in (macro, industry, market, customers, competitors), then
inside-out (activities, processes, capabilities), then choices.

| #   | Skill                   | Owns (one output)                                      |
| --- | ----------------------- | ------------------------------------------------------ |
| 11  | `pestel-scan`           | Ranked macro-trend table                               |
| 12  | `five-forces`           | Industry attractiveness assessment                     |
| 13  | `market-sizing`         | TAM, SAM, and SOM estimate                             |
| 14  | `customer-segmentation` | Customer segment definitions and targeting             |
| 15  | `competitor-benchmark`  | Client-versus-peer comparison table                    |
| 16  | `value-chain`           | Activity cost and value map                            |
| 17  | `process-mapping`       | Current- and future-state map of one business process  |
| 18  | `vrio-analysis`         | Sustained-advantage test of resources and capabilities |
| 19  | `swot-analysis`         | Consolidated SWOT with strategic implications          |
| 20  | `growth-strategy`       | Prioritized growth avenue map                          |
| 21  | `strategic-options`     | Scored, mutually exclusive strategic alternatives      |
| 22  | `portfolio-matrix`      | Portfolio roles for existing units                     |
| 23  | `pricing-strategy`      | Price metric, structure, level, and discount rules     |

### 4. Quantify: what is it worth?

Split: by financial view. Per unit, projection, investment case, coherent
futures, and single-driver stress test.

| #   | Skill                  | Owns (one output)                           |
| --- | ---------------------- | ------------------------------------------- |
| 24  | `unit-economics`       | Per-unit profitability and payback          |
| 25  | `financial-model`      | Driver-based financial projection           |
| 26  | `business-case`        | Incremental investment case and funding ask |
| 27  | `scenario-analysis`    | Consistent multi-driver future scenarios    |
| 28  | `sensitivity-analysis` | Driver ranking and breakeven thresholds     |

### 5. Synthesize and storyline: what is the answer, and how do we argue it?

Split: meaning, opening, logic, data narrative, slide plan, and the two written
formats (summary of a deliverable versus a request for a decision).

| #   | Skill                 | Owns (one output)                                        |
| --- | --------------------- | -------------------------------------------------------- |
| 29  | `insight-synthesis`   | Ranked cross-workstream insights and the one-line answer |
| 30  | `scqa-storyline`      | Situation-complication-question-answer opening           |
| 31  | `pyramid-structure`   | Governing thought, key lines, and support                |
| 32  | `executive-summary`   | One-page summary of a finished deliverable               |
| 33  | `decision-memo`       | Stand-alone memo that requests one decision              |
| 34  | `recommendation-deck` | Ghost deck (slide-by-slide plan)                         |
| 35  | `data-storytelling`   | Narrative for one analysis                               |

### 6. Build exhibits and slides: how do we show it?

Split: chart type, then chart, then exhibit, then slide. Words, layout, and
style each have one owner. The last skill is the readiness gate.

| #   | Skill                | Owns (one output)                                       |
| --- | -------------------- | ------------------------------------------------------- |
| 36  | `chart-selection`    | Chart type choice for one message                       |
| 37  | `data-visualization` | Rendered chart or chart spec                            |
| 38  | `exhibit-builder`    | Slide-ready exhibit with callouts and sources           |
| 39  | `action-titles`      | Slide headlines                                         |
| 40  | `slide-layout`       | Layout of one slide                                     |
| 41  | `slide-copy-editor`  | Edited slide body text                                  |
| 42  | `visual-consistency` | Deck-wide style spec and deviation log                  |
| 43  | `appendix-builder`   | Appendix and cross-reference map                        |
| 44  | `speaker-notes`      | Presenter notes and timing                              |
| 45  | `deck-quality-check` | Readiness verdict, figure tie-out, and routed issue log |

### 7. Implement and govern: how does it happen and stick?

Split: when, how organized, who decides, who to engage, how people adopt, what
could go wrong, how we measure, and how we report progress.

| #   | Skill                    | Owns (one output)                                            |
| --- | ------------------------ | ------------------------------------------------------------ |
| 46  | `implementation-roadmap` | Phased roadmap with milestones and dependencies              |
| 47  | `operating-model`        | Target operating model and gaps                              |
| 48  | `raci-builder`           | RACI matrix                                                  |
| 49  | `stakeholder-map`        | Stakeholder register and engagement plan                     |
| 50  | `change-plan`            | People-side change plan and adoption metrics                 |
| 51  | `risk-assessment`        | Delivery risk register                                       |
| 52  | `kpi-dashboard`          | KPI tree, dictionary, and dashboard wireframe                |
| 53  | `status-report`          | Programme status report with issue, action, and decision log |

### 8. AI value: where does AI pay, and how is the return proven?

Split: by step in the AI value cycle. Readiness, opportunities, proof on client
data, workflow redesign, value capture, and value tracking.

| #   | Skill                     | Owns (one output)                            |
| --- | ------------------------- | -------------------------------------------- |
| 54  | `ai-readiness-assessment` | AI readiness scorecard and first actions     |
| 55  | `ai-opportunity-scan`     | Ranked AI use list with value at stake       |
| 56  | `ai-bootcamp-design`      | AI bootcamp plan with go or no-go criteria   |
| 57  | `ai-workflow-redesign`    | People and AI task design for one workflow   |
| 58  | `ai-value-capture-plan`   | Plan that turns AI capacity into P&L results |
| 59  | `ai-value-tracker`        | AI value baseline and realized ROI report    |

## Example chains

- **Growth strategy:** `engagement-proposal` > `problem-framing` >
  `audience-brief` > `issue-tree` > `hypothesis-map` > `market-sizing` >
  `customer-segmentation` > `growth-strategy` > `strategic-options` >
  `business-case` > `insight-synthesis` > `scqa-storyline` >
  `pyramid-structure` > `recommendation-deck` > `action-titles` >
  `deck-quality-check`.
- **Cost diagnostic:** `problem-framing` > `issue-tree` > `value-chain` >
  `process-mapping` > `competitor-benchmark` > `financial-model` >
  `sensitivity-analysis` > `insight-synthesis` > `executive-summary`.
- **Board decision:** `audience-brief` > `strategic-options` > `business-case` >
  `decision-memo`.
- **Rollout:** `operating-model` > `implementation-roadmap` > `raci-builder` >
  `stakeholder-map` > `change-plan` > `risk-assessment` > `kpi-dashboard` >
  `status-report`.
- **AI value:** `ai-readiness-assessment` > `ai-opportunity-scan` >
  `ai-bootcamp-design` > `ai-workflow-redesign` > `business-case` >
  `ai-value-capture-plan` > `change-plan` > `ai-value-tracker`.

## Install

Gofer users need no separate install. To use the skills without Gofer, install
each skill as one folder with one `SKILL.md`. Install only the skills you need,
or all 59.

| Surface                    | How to install                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code                | Copy the folders to `~/.claude/skills/` (all projects) or `.claude/skills/` (one repository).                                                                                                            |
| Claude apps (web, desktop) | Zip each folder and upload it in Settings, under Skills.                                                                                                                                                 |
| Claude API                 | Upload each folder through the Skills API (`/v1/skills`). Attach skills to a request through the container `skills` list with the code execution tool.                                                   |
| Codex (CLI, IDE, app)      | Copy the folders to `.agents/skills/` in a repository, or `~/.agents/skills/` for all repositories. Older Codex builds read `~/.codex/skills/`. Mention a skill with `$skill-name`, or let Codex choose. |
| ChatGPT                    | Where your workspace has skills turned on, upload one zip per skill.                                                                                                                                     |
| OpenAI API                 | Upload each folder through the Skills API (`/v1/skills`). Attach skills to the hosted shell container.                                                                                                   |
| GitHub Copilot             | Copy the folders to `.github/skills/` in a repository.                                                                                                                                                   |
| Any other model            | Paste the body of a `SKILL.md` into the system or developer instructions.                                                                                                                                |

Make one zip per skill, with the folder at the zip root:

```sh
cd .specify/references/consulting/skills
mkdir -p ../dist
for d in */; do zip -qr "../dist/${d%/}.zip" "$d"; done
```

On Windows PowerShell:

```powershell
cd .specify\references\consulting\skills
New-Item -ItemType Directory -Force ..\dist | Out-Null
Get-ChildItem -Directory | ForEach-Object { Compress-Archive -Path $_.Name -DestinationPath "..\dist\$($_.Name).zip" -Force }
```

References: [Agent Skills specification](https://agentskills.io/specification),
[Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview),
[Claude Skills API guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide),
[Codex skills](https://developers.openai.com/codex/skills),
[OpenAI API skills](https://developers.openai.com/api/docs/guides/tools-skills).

## Portability rules

Run `npm run consultant-toolkit:check` after any edit. It enforces:

| Rule                                                                                                                                     | Why                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frontmatter has only `name` and a double-quoted `description`                                                                            | These are the two fields every surface reads.                                             |
| `name` matches the folder: lowercase words joined by single hyphens, with no vendor words                                                | Open-standard naming rule. Claude rejects reserved words.                                 |
| Description of 160 bytes or less, ASCII, no angle brackets, ending with a "Use ..." trigger                                              | Under the strictest per-field limits. Claude rejects XML tags. The trigger helps routing. |
| All names and descriptions total 8,000 bytes or less                                                                                     | Fits the Codex skill-list budget, so no skill is shortened or dropped.                    |
| Each `SKILL.md` is 4 KB or less                                                                                                          | Loads in full on every surface.                                                           |
| No vendor product names, host tool names, or host syntax in the body. Open formats (Vega-Lite, Mermaid) appear only as optional outputs. | The same instructions work in every product.                                              |
| No software delivery terms (sprint, backlog, deployment, repository, and similar)                                                        | Every skill stays a business consulting skill, not an app development skill.              |
| Same sections and shared rules in every skill                                                                                            | Outputs chain cleanly from one skill to the next.                                         |
| Every skill reference resolves to a real skill, and each catalog output is unique                                                        | Hand-offs work, and no two skills overlap.                                                |

Skills that can use code (for example `data-visualization` and
`financial-model`) say what to do when code execution is available and when it
is not. No skill needs scripts, network access, or a specific tool.

## Out of scope

These are deliberate gaps, not overlaps:

- Collecting evidence: survey and interview-guide design, data collection, and
  workshop facilitation. `ai-bootcamp-design` plans an AI bootcamp; it does not
  run it.
- Cost programmes: firm-wide cost baselines and savings targets.
  `ai-value-tracker` sets the baseline for one AI use only.
- Specialist advice: legal, tax, and M&A due diligence.

## Attribution

This is an independent toolkit. It is not affiliated with or endorsed by any
consulting firm. Framework names belong to their authors: Porter (Five Forces,
value chain), Barney (VRIO), Minto (Pyramid Principle), BCG (growth-share
matrix), GE and McKinsey (nine-box matrix), Ansoff (growth matrix), and Prosci
(ADKAR).
