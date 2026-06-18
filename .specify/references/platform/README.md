# Public Platform Reference Pack

This folder contains public-safe fallback references for EAI Gofer workflows
that need platform, template, or deployment guidance while offline.

Core files:

- `eai.md` - CLI and platform fallback guidance
- `eai-repo-contract.md` - repo-owned behavior contract for AI agents in EAI repos
- `eai-error-catalog.yaml` - common EAI CLI/platform failure signatures and recovery paths
- `vertical-template.md` - fallback template guidance
- `deployment-repo.md` - fallback deployment guidance

These files are intentionally public-safe. Private repositories can replace or
extend them with organization-specific references, but Gofer should always be
able to fall back to this pack without exposing secrets or tenant-private data.
