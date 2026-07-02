# Multi-CLI Setup Guide

**Feature 028: Cross-Platform Command Parity**

Use Claude Code CLI, Codex CLI, Gemini CLI, and GitHub Copilot CLI
interchangeably with Gofer!

## Overview

Gofer now supports **4 AI CLIs** with automatic command synchronization:

| CLI              | Directory           | Invocation             | Auto-Generated                |
| ---------------- | ------------------- | ---------------------- | ----------------------------- |
| **Claude Code**  | `.claude/commands/` | `/0_gofer_start`       | ✅ Yes (bundled)              |
| **Codex**        | `.agents/skills/`   | `$0_gofer_start`       | ✅ Yes (from command sources) |
| **Gemini**       | `.gemini/commands/` | `/gofer:0_gofer_start` | ✅ Yes (from command sources) |
| **Copilot Chat** | `.github/prompts/`  | `#0_gofer_start`       | ✅ Yes (bundled)              |

---

## Installation

### Prerequisites

1. **VSCode Extension**: Install Gofer from the marketplace
2. **Node.js**: v18+ required for CLI tools

### 1. Claude Code CLI

Already installed if you're using this guide!

```bash
# Verify installation
claude --version
```

### 2. Codex CLI

```bash
# Install via Homebrew (macOS/Linux)
brew install openai/tap/codex-cli

# Or via npm (all platforms)
npm install -g @openai/codex-cli

# Verify installation
codex --version
```

**Configure API Key:**

```bash
codex config set api_key <your-openai-api-key>
```

### 3. Gemini CLI

```bash
# Install via npm
npm install -g @google/gemini-cli

# Verify installation
gemini --version

# Create config directory
mkdir -p ~/.gemini
```

**Configure API Key:**

```bash
# Get API key from: https://aistudio.google.com/apikey
export GOOGLE_API_KEY # set this in your shell when needed

# Or configure via CLI
gemini config set api_key <your-google-api-key>
```

### 4. GitHub Copilot CLI

**Option A: Via GitHub CLI (Recommended)**

```bash
# Copilot CLI is included with gh
gh copilot --version
```

**Option B: Standalone Installation**

```bash
# Install via npm
npm install -g @github/copilot-cli

# Or via Homebrew
brew install github-copilot-cli
```

**Configure Authentication:**

```bash
# Generate token at: https://github.com/settings/tokens
# Permissions needed: Copilot Requests
export GH_TOKEN="your-github-token"

# Or authenticate via gh CLI
gh auth login
```

---

## How It Works

### Automatic Skill Generation

When Gofer initializes or upgrades your workspace:

1. **Claude commands** are copied from bundled resources → `.claude/commands/`
2. **Codex skills** are generated from Claude commands → `.agents/skills/`
3. **Gemini commands** are emitted to `.gemini/commands/gofer/`
4. **Copilot prompts** are copied from bundled resources → `.github/prompts/`

**Codex Discovery:** Codex scans `.agents/skills/` from the current working
directory up to the repository root, so Gofer installs the repo-local surface
there and does not need a `~/.codex/skills/` symlink.

### Platform Detection Priority

Gofer auto-detects which CLI you're using:

1. **User setting** (`gofer.defaultCLI`) - if explicitly set
2. **Directory presence** - Claude > Codex > Copilot (based on feature
   completeness)
3. **Execution context** - VSCode extension host
4. **Fallback** - 'auto' mode

### Command Routing

All CLIs access the same Gofer commands with platform-specific syntax:

```bash
# Claude Code CLI
/0_gofer_start "Add user authentication"

# Codex CLI
$0_gofer_start "Add user authentication"

# Gemini CLI (uses same skills as Codex)
/gofer:0_gofer_start "Add user authentication"

# GitHub Copilot Chat (in VSCode)
#0_gofer_start "Add user authentication"
```

---

## Feature Parity Matrix

| Feature                         | Claude    | Codex       | Gemini       | Copilot   |
| ------------------------------- | --------- | ----------- | ------------ | --------- |
| **Gofer Pipeline**              | ✅ Full   | ✅ Full     | ✅ Full      | ✅ Full   |
| **Global CLI Access**           | ✅ Native | Repo-local  | ✅ Native    | ✅ Native |
| **Task Tool (Parallel Agents)** | ✅ Yes    | ❌ No\*     | ✅ Yes (MCP) | ❌ No\*   |
| **Auto-Chaining**               | ✅ Yes    | ❌ Manual   | ❌ Manual    | ✅ Yes    |
| **Memory/Context**              | ✅ Yes    | ✅ Yes      | ✅ Yes       | ✅ Yes    |
| **Max Context Window**          | 200k      | 128k        | 2M†          | 128k      |
| **VSCode Integration**          | ✅ Native | ❌ CLI only | ❌ CLI only  | ✅ Native |

\*Codex and Copilot commands include notes about manual workflow when Task tool
is unavailable †Gemini 1.5 Pro supports up to 2M tokens

---

## Verification Steps

### 1. Check Directories Created

After Gofer initializes your workspace:

```bash
# Claude commands
ls -la .claude/commands/
# Should show: 0_gofer_start.md, 1_gofer_research.md, etc.

# Codex/Gemini skills
ls -la .agents/skills/
# Should show subdirectories: 0_gofer_start/, 1_gofer_research/, etc.

# Copilot prompts
ls -la .github/prompts/
# Should show: 0_gofer_start.prompt.md, 1_gofer_research.prompt.md, etc.
```

### 2. Test Each CLI

**Claude Code:**

```bash
cd your-workspace
claude "Use /0 to triage my feature"
```

**Codex:**

```bash
cd your-workspace
codex "Use $ $0 to triage my feature"
```

**Gemini:**

```bash
cd your-workspace
gemini "/gofer:0_gofer_start Add user authentication"
```

**Copilot (in VSCode):**

1. Open Command Palette (`Cmd+Shift+P`)
2. Type "Chat: Focus on Chat View"
3. In chat, type `#0 triage my feature`

### 3. Verify Skill Discovery

**Codex:**

```bash
# List available skills
codex "What skills do you have?"

# Should include all Gofer commands
```

**Gemini:**

```bash
# List available skills
gemini "What skills are available in .agents/skills?"
```

---

## Troubleshooting

### Codex: Skills Not Found

**Problem:** `/0` doesn't appear in Codex

**Solution:**

```bash
# Check if .agents/skills exists
ls -la .agents/skills/

# If missing, regenerate from extension
# In VSCode: Cmd+Shift+P → "Gofer: Upgrade Templates"

# Verify Codex is looking in the right directory
cd your-workspace
codex "List files in .agents/skills/"
```

### Codex: Skills Only Show Inside One Repo

**Problem:** Codex only shows Gofer skills when launched from the repository

**Solution:**

Gofer intentionally installs Codex skills repo-locally in `.agents/skills/`.
Launch Codex from the repository root or a subdirectory so Codex can scan up to
that root:

```bash
# Check the repo-local skills
ls -la .agents/skills/

# Relaunch Codex from the repo root
cd your-workspace
codex "What skills do you have?"
```

If you need a user-level shared install across repos, use the official
`$HOME/.agents/skills/` location or explicit `[[skills.config]]` path overrides,
not `~/.codex/skills/`.

### Gemini: Skills Not Discovered

**Problem:** Gemini doesn't see skills

**Solution:**

```bash
# Check the generated Gemini surface
ls -la .gemini/commands/gofer/

# Restart Gemini from the repo after template generation
gemini "/gofer:0_gofer_start Test discovery"
```

### Copilot: Prompts Not Appearing

**Problem:** `#command` not recognized

**Solution:**

```bash
# Check if .github/prompts exists
ls -la .github/prompts/

# Restart VSCode to reload Copilot Chat
# Cmd+Shift+P → "Developer: Reload Window"
```

### Memory/Context Not Working

**Problem:** CLI doesn't remember previous conversation

**Solution:**

- **Claude**: Uses conversation history automatically
- **Codex**: Maintains context within session (use `--continue`)
- **Gemini**: Use `--session` flag to preserve context
- **Copilot**: Context preserved in VSCode chat panel

---

## Configuration

### Set Default CLI

```json
// .vscode/settings.json
{
  "gofer.defaultCLI": "claude" // or "codex", "gemini", "copilot", "auto"
}
```

### Custom Skill Locations

By default, Gofer generates skills in:

- Codex/Gemini: `.agents/skills/`
- Copilot: `.github/prompts/`

To customize, modify `ResourceSyncer.ts` in the extension.

---

## Advanced Usage

### Manual Skill Regeneration

If commands get out of sync:

```bash
# In VSCode Command Palette:
# Cmd+Shift+P → "Gofer: Upgrade Templates"

# This will:
# 1. Update Claude commands from bundled resources
# 2. Regenerate Codex/Gemini skills from Claude commands
# 3. Update Copilot prompts from bundled resources
```

### Using Multiple CLIs Simultaneously

Each CLI maintains its own session, so you can:

1. Start research in **Claude Code**: `/1_gofer_research "authentication"`
2. Switch to **Codex** for implementation: `$ $5_gofer_implement`
3. Validate with **Gemini**: `$ $6_gofer_validate`
4. Use **Copilot Chat** for quick iterations in VSCode

### Cross-Platform Compatibility

All generated artifacts (`.specify/specs/`, tasks, research, etc.) are
CLI-agnostic. You can start a feature in one CLI and continue in another.

---

## Resources

### Documentation

- [Claude Code CLI Docs](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI Skills Guide](https://developers.openai.com/codex/skills)
- [Gemini CLI Documentation](https://geminicli.com/docs/)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli)

### MCP (Model Context Protocol)

- [MCP Specification](https://modelcontextprotocol.io/)
- [Gemini MCP Servers](https://geminicli.com/docs/tools/mcp-server/)
- [Building MCP Servers](https://codelabs.developers.google.com/cloud-gemini-cli-mcp-go)

### Community

- [Gofer GitHub Repository](https://github.com/eai-tools/eai-gofer)
- [Report Issues](https://github.com/eai-tools/eai-gofer/issues)
- [Feature Requests](https://github.com/eai-tools/eai-gofer/discussions)

---

## FAQ

### Q: Do I need all 4 CLIs installed?

**A:** No! Install only the CLIs you want to use. Gofer will generate files for
all platforms, but they're only used if you invoke that CLI.

### Q: Which CLI should I use?

**A:** It depends on your use case:

- **Claude Code**: Best for VSCode integration, largest context window (200k)
- **Codex**: Great for OpenAI ecosystem, fastest response times
- **Gemini**: Massive context (2M tokens), excellent for large codebases
- **Copilot**: Seamless VSCode integration if you already have Copilot

### Q: Can I use multiple CLIs in the same project?

**A:** Yes! All CLIs share the same artifact directories (`.specify/specs/`,
etc.), so you can switch between them freely.

### Q: What happens if I update a command?

**A:** When you upgrade Gofer templates
(`Cmd+Shift+P → Gofer: Upgrade Templates`), all platform-specific commands are
regenerated from the latest Claude commands.

### Q: Do memory and context work across CLIs?

**A:** Memory artifacts (`.specify/memory/`) are shared, but active conversation
context is CLI-specific. Each CLI maintains its own session history.

---

## Next Steps

1. **Install your preferred CLIs** using the instructions above
2. **Verify installation** by running `/0` (or platform equivalent)
3. **Test the pipeline** by triaging a sample feature
4. **Explore features** like parallel validation agents, auto-chaining, and
   memory

**Need help?** Open an issue at
[github.com/eai-tools/eai-gofer/issues](https://github.com/eai-tools/eai-gofer/issues)
