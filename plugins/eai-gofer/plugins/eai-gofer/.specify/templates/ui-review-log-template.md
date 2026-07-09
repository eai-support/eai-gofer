---
feature: '{{feature-name}}'
created: '{{ISO-timestamp}}'
workflowProfile: enterpriseai
---

# UI Review Log: {{feature-name}}

## Fast Preview Contract

Every UI-facing change must add a row here before the agent reports the change
as complete. Prefer the repo-owned helper:

```bash
node .specify/scripts/node/gofer-ui-preview.mjs --feature-dir {{feature-dir}} --open auto --screenshot --change "{{change-summary}}"
```

Use `--command "{{preview-command}}"` when the preview command cannot be
auto-detected, or `--url {{preview-url}}` when a server is already running.

| Time              | Change Trigger     | Command             | URL             | Browser Target        | Screenshot                   | Package Lane | Coupling Status     | Storybook Story IDs | Theme Override Points | Self-Review     | Stakeholder Feedback | User Feedback Applied | Open Issues |
| ----------------- | ------------------ | ------------------- | --------------- | --------------------- | ---------------------------- | ------------ | ------------------- | ------------------- | --------------------- | --------------- | -------------------- | --------------------- | ----------- |
| {{ISO-timestamp}} | {{change-summary}} | {{preview-command}} | {{preview-url}} | Integrated / External | {{screenshot-or-playwright}} | {{lane}}     | {{coupling-status}} | {{story-ids}}       | {{theme-overrides}}   | {{self-review}} | {{feedback}}         | {{applied}}           | {{open}}    |
