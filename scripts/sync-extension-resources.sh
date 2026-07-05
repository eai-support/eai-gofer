#!/usr/bin/env bash
# Sync canonical Gofer source dirs into extension/resources/ so the VSIX bundle
# ships current content. Called automatically by release.sh before
# `vsce package`; also safe to run manually.
#
# Without this sync, edits to .claude/commands/, .github/prompts/, .specify/
# stay in the repo but never reach end users because the extension installer
# reads from extension/resources/, which was historically maintained by hand.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf "\033[0;34mi\033[0m %s\n" "$1"; }
ok()  { printf "\033[0;32m✓\033[0m %s\n" "$1"; }

# sync_dir <canonical-src> <bundle-dst>
#   Mirrors src → dst: copies new files, updates changed files, removes files
#   in dst that are not in src (so renames/deletions propagate). Preserves
#   permissions. Directories are created as needed.
sync_dir() {
  local src="$1"
  local dst="$2"

  if [[ ! -d "$src" ]]; then
    log "skip: $src does not exist"
    return
  fi

  mkdir -p "$dst"

  # --delete removes files in dst that aren't in src (intentional drift cleanup)
  # --exclude patterns protect a few dst-only conventions if any ever emerge.
  rsync -a --delete "${src%/}/" "${dst%/}/"
  ok "synced ${src} → ${dst}"
}

log "Syncing canonical sources into extension/resources/ ..."

sync_dir ".claude/commands"        "extension/resources/claude-commands"
sync_dir ".claude/agents"          "extension/resources/claude-agents"
sync_dir ".claude/skills"          "extension/resources/claude-skills"
sync_dir ".github/agents"          "extension/resources/github-agents"
sync_dir ".github/prompts"         "extension/resources/copilot-prompts"
sync_dir ".github/instructions"    "extension/resources/copilot-instructions"
sync_dir ".github/skills"          "extension/resources/github-skills"
sync_dir ".gemini"                 "extension/resources/gemini"
sync_dir ".specify/commands"       "extension/resources/specify-commands"
sync_dir ".specify/references"     "extension/resources/references"
sync_dir ".specify/scripts/bash"   "extension/resources/bash-scripts"
sync_dir ".specify/scripts/powershell" "extension/resources/powershell-scripts"
sync_dir ".specify/scripts/node"   "extension/resources/node-scripts"
sync_dir ".specify/scripts/hooks"  "extension/resources/hook-scripts"
sync_dir ".specify/templates"      "extension/resources/templates"

# Re-chmod bash scripts to executable after sync (rsync -a preserves src
# permissions, but this is a safety net for fresh checkouts).
find extension/resources/bash-scripts extension/resources/hook-scripts \
  -type f \( -name "*.sh" -o -name "*.bash" \) -exec chmod +x {} \; 2>/dev/null || true

ok "extension/resources/ is in sync with canonical sources"
