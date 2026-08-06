# Gofer Extension Auto-Installation Setup

## ✅ What's Been Configured

The devcontainer has been configured to **automatically install** the Gofer
extension every time the codespace starts, with robust error handling and
fallback mechanisms.

## 🎉 No Manual Steps Required!

The extension is automatically installed when:

- Creating a new codespace
- Restarting an existing codespace
- Rebuilding the container

## 🔍 How It Works

1. **Setup script** (`.devcontainer/setup.sh`) runs on codespace creation to
   install dependencies
2. **Install script** (`.devcontainer/install-extension.sh`) runs on codespace
   start to install extension:
   - First tries to fetch latest version from `releases.json`
   - Downloads VSIX from GitHub Pages:
     `https://eai-support.github.io/eai-gofer/releases/eai-gofer-{version}.vsix`
   - **Fallback**: If download fails, builds extension from local source
3. **Installs extension** using `code --install-extension --force`

## 🛡️ Robust Installation

The installation process includes multiple fallback mechanisms:

1. **Primary**: Download latest version from GitHub releases
2. **Fallback**: Build from local source if download fails
3. **Force reinstall**: Always reinstalls to ensure latest version

## ✅ Verification

After the codespace starts, verify installation:

```bash
# Check if extension is installed
code --list-extensions | grep gofer
# Should output: enterpriseai.eai-gofer
```

You should also see in the terminal during startup:

- "🔌 Installing Gofer extension..."
- "Downloading version X.X.X..."
- "✅ Gofer extension vX.X.X installed from GitHub releases!"

The extension will appear in:

- Extensions sidebar (Ctrl/Cmd+Shift+X)
- Command palette (F1 → search for "Gofer")

## 🔄 Automatic Updates

Every time you:

- Create a new codespace
- Rebuild your codespace

The setup script will automatically fetch and install the latest version from
the repository releases.

## 🛠️ Manual Installation (if needed)

If the automatic installation fails, you can manually install:

```bash
# Get latest version
LATEST=$(curl -s https://eai-support.github.io/eai-gofer/releases.json | grep -o '"latest_version": "[^"]*"' | cut -d'"' -f4)

# Download and install
curl -L -o /tmp/eai-gofer.vsix "https://eai-support.github.io/eai-gofer/releases/eai-gofer-${LATEST}.vsix"
code --install-extension /tmp/eai-gofer.vsix
```

## 📝 Troubleshooting

**Extension not appearing?**

- Check the terminal output for errors during setup
- Verify releases.json is accessible:
  `curl -s https://eai-support.github.io/eai-gofer/releases.json`
- Try rebuilding: F1 → "Codespaces: Rebuild Container"

**Want a specific version?**

- Modify `.devcontainer/setup.sh` to download a specific version instead of
  latest
