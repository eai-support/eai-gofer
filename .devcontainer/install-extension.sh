#!/bin/bash
set -e

echo "🔌 Installing EAI-GOFER extension..."

# Try to install from GitHub releases
install_from_github() {
  echo "   Attempting to install from GitHub releases..."
  RELEASES_JSON="https://eai-support.github.io/eai-gofer/releases.json"
  
  # Try to get latest version
  LATEST_VERSION=$(curl -s "$RELEASES_JSON" 2>/dev/null | grep -o '"latest_version": "[^"]*"' | cut -d'"' -f4)
  
  if [ -n "$LATEST_VERSION" ]; then
    # Try the new name first, then fall back to old name
    VSIX_URL="https://eai-support.github.io/eai-gofer/releases/eai-gofer-${LATEST_VERSION}.vsix"
    VSIX_FILE="/tmp/eai-gofer-${LATEST_VERSION}.vsix"
    
    echo "   Downloading version $LATEST_VERSION..."
    if curl -L -o "$VSIX_FILE" "$VSIX_URL" 2>/dev/null && [ -s "$VSIX_FILE" ]; then
      echo "   Installing extension..."
      if code --install-extension "$VSIX_FILE" --force 2>/dev/null; then
        rm -f "$VSIX_FILE"
        echo "✅ EAI-GOFER extension v$LATEST_VERSION installed from GitHub releases!"
        return 0
      fi
    fi
    
    # Fall back to the historical VSIX filename for already-published releases.
    VSIX_URL="https://eai-support.github.io/eai-gofer/releases/gofer-${LATEST_VERSION}.vsix"
    VSIX_FILE="/tmp/gofer-${LATEST_VERSION}.vsix"
    
    echo "   Trying legacy filename..."
    if curl -L -o "$VSIX_FILE" "$VSIX_URL" 2>/dev/null && [ -s "$VSIX_FILE" ]; then
      echo "   Installing extension..."
      if code --install-extension "$VSIX_FILE" --force 2>/dev/null; then
        rm -f "$VSIX_FILE"
        echo "✅ EAI-GOFER extension v$LATEST_VERSION installed from GitHub releases!"
        return 0
      fi
    fi
  fi
  
  echo "⚠️  Could not install from GitHub releases"
  return 1
}

# Build and install from local source
install_from_source() {
  echo "   Building extension from source..."
  cd /workspaces/eai-gofer/extension
  
  # Ensure dependencies are installed
  npm install --silent 2>/dev/null || true
  
  # Build the extension (use -y to skip npx prompts)
  if npm run compile 2>/dev/null && npx -y @vscode/vsce package --out /tmp/eai-gofer-local.vsix 2>/dev/null; then
    echo "   Installing locally built extension..."
    if code --install-extension /tmp/eai-gofer-local.vsix --force 2>/dev/null; then
      rm -f /tmp/eai-gofer-local.vsix
      echo "✅ EAI-GOFER extension installed from local build!"
      cd /workspaces/eai-gofer
      return 0
    fi
  fi
  
  cd /workspaces/eai-gofer
  echo "❌ Failed to build and install extension from source"
  return 1
}

# Check if extension is already installed (check both old and new names)
if code --list-extensions 2>/dev/null | grep -qE "EnterpriseAI\.(gofer|eai-gofer)"; then
  echo "ℹ️  EAI-GOFER extension already installed, reinstalling to ensure latest version..."
  code --uninstall-extension EnterpriseAI.gofer 2>/dev/null || true
  code --uninstall-extension EnterpriseAI.gofer 2>/dev/null || true
fi

# Try GitHub releases first, fall back to local build
if ! install_from_github; then
  echo "   Falling back to local build..."
  if ! install_from_source; then
    echo "❌ Failed to install EAI-GOFER extension"
    echo "   You can manually install by running:"
    echo "   cd /workspaces/eai-gofer && ./test-vsix.sh"
    exit 0  # Don't fail the container startup
  fi
fi

echo "✅ EAI-GOFER extension installation complete!"
