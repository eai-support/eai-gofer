---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Gofer - Deployment

## Executive Summary

Gofer is deployed through three distribution channels:

1. **GitHub Releases and Pages** - VSIX + agent plugin ZIP + source tarball
2. **VS Code Marketplace** - Extension VSIX when publisher authorization is
   configured
3. **Agent Plugin Marketplaces** - Claude Code, Copilot CLI, Codex, and Gemini
   installations

All deployments are automated via GitHub Actions CI/CD pipelines with version
tagging and semantic versioning.

## Deployment Architecture

```mermaid
flowchart TB
    subgraph "Development"
        Dev["Developer"]
        Git["Git Repository<br/>eai-tools/eai-gofer"]
    end

    subgraph "CI/CD (GitHub Actions)"
        CI["CI Pipeline<br/>ci.yml"]
        Release["Release Pipeline<br/>release.yml"]
        Pages["Pages Pipeline<br/>pages.yml"]
    end

    subgraph "Distribution"
        VSCodeMarketplace["VS Code Marketplace<br/>Gofer"]
        GitHubReleases["GitHub Releases<br/>VSIX + Plugin ZIP"]
        ClaudeMarket["Claude Plugin Marketplace<br/>eai-tools/eai-gofer"]
        CopilotMarket["Copilot Plugin Marketplace"]
        LocalPlugins["Local Plugin Installs<br/>~/plugins/eai-gofer"]
    end

    subgraph "Documentation"
        GHPages["GitHub Pages<br/>docs site"]
    end

    subgraph "End Users"
        VSCode["VS Code Users"]
        Claude["Claude Code Users"]
        Copilot["Copilot Users"]
        Codex["Codex Users"]
    end

    Dev -->|Push/Tag| Git
    Git -->|Trigger| CI
    Git -->|Tag v*| Release
    Git -->|.tech-docs change| Pages

    Release -->|Publish| VSCodeMarketplace
    Release -->|Upload Assets| GitHubReleases
    Release -->|Register| ClaudeMarket
    Release -->|Register| CopilotMarket

    Pages -->|Deploy| GHPages

    VSCodeMarketplace -->|Install| VSCode
    GitHubReleases -->|Download| VSCode
    ClaudeMarket -->|Install| Claude
    CopilotMarket -->|Install| Copilot
    GitHubReleases -->|Download| LocalPlugins
    LocalPlugins -->|Install| Codex
```

## Infrastructure

### GitHub Repository

- **Repository:** [eai-tools/eai-gofer](https://github.com/eai-tools/eai-gofer)
- **Primary Branch:** `main`
- **Protected Branches:** `main`, `develop`
- **Required Checks:** CI tests, linting, type checking

### CI/CD Pipelines

#### CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**

- Push to `main`, `develop`, `feature/*`, `hotfix/*`
- Pull requests to `main`, `develop`

**Jobs:**

1. **Code Quality Gates** (10min timeout)
   - Install dependencies
   - Run linter (`npm run lint`)
   - Run type checker (`npm run typecheck`)
   - Run tests (`npm test`)
   - Generate coverage report

2. **Extension Build** (15min timeout)
   - Build extension (`cd extension && npm run compile`)
   - Build language server (`cd language-server && npm run build`)
   - Package VSIX (`npx vsce package`)
   - Upload VSIX as artifact

**Node Version:** 24.x

#### Release Pipeline (`.github/workflows/release.yml`)

**Triggers:**

- Push tags matching `v*.*.*`
- Manual workflow dispatch with version input

**Jobs:**

1. **Build and Publish Release** (30min timeout)
   - Checkout repository
   - Install dependencies
   - Run tests
   - Build all components (`npm run build:all`)
   - Generate command surfaces (`npm run gofer:generate`)
   - Package agent plugin
     (`npm run gofer:package-plugin -- --version X.Y.Z --sync-repo`)
   - Package extension VSIX (`npx vsce package`)
   - Create GitHub Release
   - Upload release assets:
     - `eai-gofer-X.Y.Z.vsix`
     - `eai-gofer-agent-plugin-X.Y.Z.zip`
     - `gofer-vX.Y.Z.tar.gz` (source)
   - Publish to VS Code Marketplace through Microsoft Entra workload identity
     when the publishing identity is authorized on the Marketplace publisher

**Required Publishing Configuration:**

- `VSCE_AZURE_CLIENT_ID`, `VSCE_AZURE_TENANT_ID`, and
  `VSCE_AZURE_SUBSCRIPTION_ID` repository variables for Entra workload identity
  publishing
- `VSCE_PAT` is retained only as a legacy fallback while Azure DevOps global
  PATs are retired
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

#### Pages Pipeline (`.github/workflows/pages.yml`)

**Triggers:**

- Push to `main` with changes to `.tech-docs/**` or `docs-site/**`
- Manual workflow dispatch
- Workflow call from release pipeline

**Jobs:**

1. **Deploy GitHub Pages** (15min timeout)
   - Checkout repository
   - Install docs-site dependencies (`cd docs-site && npm ci`)
   - Build Docusaurus site (`npm run build`)
   - Verify required files exist
   - Upload artifact
   - Deploy to GitHub Pages

**Published URL:**
[eai-tools.github.io/eai-gofer/docs](https://eai-tools.github.io/eai-gofer/docs)

### GitHub Pages

- **Source:** `docs-site/build` directory
- **Framework:** Docusaurus 3.6.3
- **Node Version:** 24.x
- **Deployment:** Automated via Pages workflow
- **Custom Domain:** Not configured

## Health Checks

### Extension Health

- **Activation:** `onStartupFinished` event in VS Code
- **Language Server:** Heartbeat via LSP connection
- **Status Bar:** Context health indicator (green/yellow/orange/red)

### CI Health Monitoring

- **GitHub Actions Status:**
  [eai-tools/eai-gofer/actions](https://github.com/eai-tools/eai-gofer/actions)
- **Coverage Reports:** Artifacts uploaded to GitHub Actions
- **Test Results:** CTRF JSON reports

## Deployment Process

### Release Script Deployment

Use `release.sh`; do not hand-edit versions, package artifacts, or tags.

1. **Prepare the release PR**

   ```bash
   ./release.sh patch "Release notes for users"
   ```

   The script bumps package versions, regenerates command surfaces, syncs
   extension resources, packages the VSIX and agent plugin, runs activation and
   command checks, runs tests, mirrors public GitHub Pages assets, commits the
   release prep, pushes a release branch, and opens a PR.

2. **Merge the release PR after CI is green**

3. **Publish the tag from merged `main`**

   ```bash
   git switch main
   git pull --ff-only origin main
   ./release.sh patch "Release notes for users"
   ```

4. **Automated Steps** (GitHub Actions handles):
   - Run CI tests
   - Build extension and agent plugin
   - Package VSIX and ZIP
   - Create GitHub Release
   - Upload release assets
   - Publish to VS Code Marketplace with Entra workload identity when the
     publishing identity is authorized, with `VSCE_PAT` only as a legacy
     fallback
   - Deploy documentation site

## Release Assets

Each GitHub Release includes:

| Asset                              | Description                           | Size   |
| ---------------------------------- | ------------------------------------- | ------ |
| `eai-gofer-X.Y.Z.vsix`             | VS Code extension package             | ~10MB  |
| `eai-gofer-agent-plugin-X.Y.Z.zip` | Agent plugin for Claude/Copilot/Codex | ~500KB |
| `gofer-vX.Y.Z.tar.gz`              | Source code tarball                   | ~2MB   |

## Agent Plugin Distribution

### Claude Code Plugin

**Marketplace Registration:**

```bash
claude plugin marketplace add eai-tools/eai-gofer --scope user
claude plugin install eai-gofer@eai-gofer --scope user
```

**Local Installation (for testing):**

```bash
# Download release ZIP
gh release download v3.4.0 \
  --repo eai-tools/eai-gofer \
  --pattern "eai-gofer-agent-plugin-3.4.0.zip" \
  --dir /tmp/eai-gofer-plugin

# Extract to stable location
rm -rf ~/plugins/eai-gofer
unzip /tmp/eai-gofer-plugin/eai-gofer-agent-plugin-3.4.0.zip -d ~/plugins

# Register local marketplace
claude plugin marketplace add ~/plugins/eai-gofer --scope user
claude plugin install eai-gofer@eai-gofer-local --scope user
```

### Copilot CLI Plugin

**Marketplace Registration:**

```bash
copilot plugin marketplace add eai-tools/eai-gofer
copilot plugin install eai-gofer@eai-gofer
```

**Local Installation:**

```bash
copilot plugin marketplace add ~/plugins/eai-gofer
copilot plugin install eai-gofer@eai-gofer-local
```

### Codex Plugin

**Local Installation Only:**

- Extract agent plugin ZIP to `~/plugins/eai-gofer/`
- Add via Codex local marketplace/import
- Keep path stable for updates

## Rollback Procedures

### Rollback Extension

1. **Identify Last Known Good Version**
   - Check GitHub Releases:
     [eai-tools/eai-gofer/releases](https://github.com/eai-tools/eai-gofer/releases)
   - Example: `v3.3.1`

2. **Download Previous VSIX**

   ```bash
   gh release download v3.3.1 --repo eai-tools/eai-gofer --pattern "*.vsix"
   ```

3. **Uninstall Current Version**

   ```bash
   code --list-extensions | rg gofer
   code --uninstall-extension <matching-gofer-extension-id>
   ```

4. **Install Previous Version**

   ```bash
   code --install-extension eai-gofer-3.3.1.vsix
   ```

5. **Disable Auto-Update** (temporary)
   - VS Code Settings: `"extensions.autoUpdate": false`

### Rollback Agent Plugin

1. **Remove Current Plugin**

   ```bash
   claude plugin uninstall eai-gofer@eai-gofer
   ```

2. **Install Previous Version**

   ```bash
   # Download previous release
   gh release download v3.3.1 \
     --repo eai-tools/eai-gofer \
     --pattern "eai-gofer-agent-plugin-3.3.1.zip"

   # Install previous version
   unzip eai-gofer-agent-plugin-3.3.1.zip -d ~/plugins/eai-gofer-3.3.1
   claude plugin marketplace add ~/plugins/eai-gofer-3.3.1
   claude plugin install eai-gofer@eai-gofer-local
   ```

## Monitoring

### Deployment Metrics

- **GitHub Actions:** Monitor workflow runs for failures
- **VS Code Marketplace:** Check download stats (if published)
- **GitHub Release Downloads:** Track asset download counts
- **Documentation Site:** GitHub Pages deployment status

### Alerts

- **CI Failure:** Email notification to repository maintainers
- **Release Failure:** GitHub Actions workflow failure notification
- **Pages Deployment Failure:** GitHub Pages build failure notification

## Security Considerations

### Secrets Management

- **VSCE_PAT:** Stored in GitHub repository secrets (encrypted)
- **GITHUB_TOKEN:** Auto-generated, scoped to repository
- **API Keys:** Never committed; use provider CLI/app login, GitHub secrets,
  shell secrets, or local `.env` files where a tool explicitly supports them

### Code Signing

- **VSIX Signing:** Not currently implemented
- **Agent Plugin Signing:** Not currently implemented
- **Release Verification:** Use GitHub Release checksums

### Supply Chain Security

- **Dependency Scanning:** Renovate bot for dependency updates
- **npm Audit:** Run during CI
- **License Compliance:** Apache-2.0 license, compatible dependencies

## Disaster Recovery

### Repository Loss

1. **Source Code:** Backed up by GitHub (distributed Git)
2. **Release Assets:** Stored in GitHub Releases (persistent)
3. **Documentation Site:** Rebuilds from `.tech-docs/` and `docs-site/`

### Rebuild from Scratch

```bash
# Clone repository
git clone https://github.com/eai-tools/eai-gofer.git
cd eai-gofer

# Install dependencies
npm install
cd extension && npm install
cd ../language-server && npm install
cd ..

# Build all components
npm run build:all

# Generate command surfaces
npm run gofer:generate

# Package agent plugin
npm run gofer:package-plugin -- --version 3.4.0 --sync-repo

# Package extension
cd extension && npx vsce package
```

### Recovery Time Objective (RTO)

- **Extension Rebuild:** < 1 hour (automated CI)
- **Agent Plugin Rebuild:** < 30 minutes (automated)
- **Documentation Site:** < 15 minutes (automated)
- **Full Repository Restore:** < 2 hours (manual)

## Environment-Specific Configuration

### Development

- **Branch:** `develop` or `feature/*`
- **Auto-Deploy:** No
- **Testing:** Local VS Code Extension Development Host

### Staging

- **Branch:** `main` (pre-release)
- **Auto-Deploy:** No
- **Testing:** Manual VSIX installation

### Production

- **Branch:** `main` (tagged release)
- **Auto-Deploy:** Yes (on tag push)
- **Distribution:** VS Code Marketplace + GitHub Releases + Agent Plugin
  Marketplaces
