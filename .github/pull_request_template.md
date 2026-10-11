<!--
Title: Enable [outcome] for [user or system] by [change made]
Say what changes, who or what benefits, and the outcome it enables.
Keep the title concise and in business language. A prefix such as CURATE: may identify a programme, but it must not replace the outcome.
Example issue title: Prevent broken EAI app data links caused by inconsistent Object Type slugs.
-->

# Pull Request

## Summary

<!-- Explain the user-facing or maintainer-facing change in plain language. -->

## Why

<!-- What problem does this change solve? Link the issue or discussion when available. -->

Closes #

## Surface Area

- [ ] VS Code extension
- [ ] Claude Code plugin
- [ ] Codex plugin
- [ ] GitHub Copilot plugin
- [ ] Gemini extension
- [ ] Docs / site only
- [ ] Release / packaging only

## Validation

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run gofer:generate` if command surfaces changed
- [ ] `npm run gofer:package-plugin -- --sync-repo` if plugin packaging changed

## Artifacts

- [ ] README updated if install, support, or workflow behavior changed
- [ ] `.tech-docs/` updated if public docs changed
- [ ] Screenshots or examples added when UI behavior changed

## Notes

<!-- Anything reviewers should look at closely, migration notes, or follow-up work. -->
