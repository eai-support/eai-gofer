# Security Policy

## Supported Versions

Gofer security fixes are focused on the latest release line and the latest
published plugin/install surfaces.

| Version line   | Supported        |
| -------------- | ---------------- |
| Latest release | Yes              |
| Older releases | Best effort only |

## Reporting A Vulnerability

Please do not open a public GitHub issue for vulnerabilities, leaked secrets, or
supply-chain concerns.

Preferred path:

1. Use GitHub private vulnerability reporting if it is enabled for the repo.
2. If private reporting is not available, contact the maintainers through GitHub
   before disclosing details publicly.

Please include:

- affected version
- impacted surface: VS Code, Claude, Codex, Copilot, Gemini, docs, or release
- reproduction steps
- severity and blast radius
- whether the issue is already publicly known

## Public Issue Attachment Policy

Do not attach ZIP files, scripts, installers, binaries, or "fix archives" to
public issues, pull requests, or comments. Paste commands, sanitized logs, and
text snippets directly instead.

Maintainers will remove unsolicited executable/archive attachments from public
issue conversations. If a file is required for a security report, use GitHub
private vulnerability reporting rather than a public issue.

The repository includes an issue/comment moderation workflow that checks new
issues and issue comments for unsafe GitHub attachment links. For comments from
unknown or unaffiliated users, unsafe archive/script/binary attachment links are
removed from the visible conversation. For issue bodies, unsafe attachment links
are replaced with a removal marker and a maintainer warning is posted.

GitHub-hosted attachment blobs may still require GitHub Trust & Safety removal
if their direct URL has already been shared elsewhere.
