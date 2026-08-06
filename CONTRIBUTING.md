# Contributing to Gofer

Thanks for contributing. Gofer is most useful when it stays easy to install,
easy to understand, and easy to adapt across different AI coding hosts.

## Before You Start

- Use [GitHub Discussions](https://github.com/eai-support/eai-gofer/discussions)
  for questions, ideas, and design conversations.
- Use [GitHub Issues](https://github.com/eai-support/eai-gofer/issues) for bugs,
  broken docs, regressions, and scoped feature requests.
- For security issues, follow [SECURITY.md](./SECURITY.md) instead of opening a
  public issue.

## Local Setup

```bash
npm install
cd extension && npm install && npm run compile
cd ../language-server && npm install
cd ..
```

Recommended verification loop:

```bash
npm run build
npm run lint
npm run typecheck
npm test
```

If you change command surfaces or plugin packaging:

```bash
npm run gofer:generate
npm run gofer:package-plugin -- --sync-repo
```

## Contribution Guidelines

- Keep changes scoped and well-explained.
- Prefer updating canonical sources over hand-editing generated outputs.
- Do not commit secrets, local machine state, or feature work under
  `.specify/specs/`.
- Do not commit build artifacts such as local `.vsix` files or generated `dist`
  output.
- Keep public docs generic and product-safe; avoid private service topology,
  credentials, or internal-only conventions.

## Pull Requests

- Link the issue or discussion when possible.
- Explain the user-facing impact.
- Include verification steps and results.
- Update README/docs when install, support, workflow, or release behavior
  changes.

## Issue Intake Automation

Roadmap-aligned issues may receive an automation-generated draft PR that adds an
intake brief under `.github/issue-prep/`. That draft PR is only preparation for
human review. It is not treated as implementation complete, and it should be
refined, replaced, or closed by a maintainer once the issue has been reviewed.

## Good First Contributions

Good public contributions usually look like:

- docs and onboarding improvements
- better examples and screenshots
- pipeline wording and command-surface polish
- host-install validation across Claude, Codex, Copilot, Gemini, and VS Code
- test coverage for packaging, generation, and release behavior
