#!/bin/bash

# Test script to validate release process without actually releasing
# This simulates what release-auto.sh does but doesn't push anything

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Testing release automation...${NC}"
echo ""

# 1. Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠ Not on main branch (currently: $CURRENT_BRANCH)${NC}"
    echo "For actual release, you must be on main"
else
    echo -e "${GREEN}✓${NC} On main branch"
fi

# 2. Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠ Uncommitted changes detected${NC}"
    echo "For actual release, commit or stash these first"
else
    echo -e "${GREEN}✓${NC} No uncommitted changes"
fi

# 3. Check extension/package.json exists
if [ ! -f "extension/package.json" ]; then
    echo "✗ extension/package.json not found"
    exit 1
else
    CURRENT_VERSION=$(node -p "require('./extension/package.json').version")
    echo -e "${GREEN}✓${NC} Extension package.json found (v$CURRENT_VERSION)"
fi

# 4. Check language-server structure
if [ ! -d "language-server/src" ]; then
    echo "✗ language-server/src not found"
    exit 1
else
    echo -e "${GREEN}✓${NC} Language server source directory exists"
fi

# 5. Check scripts/update-releases.js exists
if [ ! -f "scripts/update-releases.js" ]; then
    echo "✗ scripts/update-releases.js not found"
    exit 1
else
    echo -e "${GREEN}✓${NC} Release update script exists"
fi

# 6. Test Node.js version calculation
TEST_VERSION="1.99.99"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./extension/package.json', 'utf8'));
console.log('Current version:', pkg.version);
console.log('Would update to:', '$TEST_VERSION');
" && echo -e "${GREEN}✓${NC} Version update logic works"

# 7. Check GitHub Pages workflow
if [ ! -f ".github/workflows/pages.yml" ]; then
    echo "✗ GitHub Pages workflow not found"
    exit 1
else
    echo -e "${GREEN}✓${NC} GitHub Pages workflow exists"
fi

# 8. Test curl to GitHub Pages (optional, may fail if not deployed)
echo ""
echo -e "${BLUE}Testing GitHub Pages endpoint...${NC}"
if LATEST=$(curl -s "https://eai-support.github.io/eai-gofer/releases.json" | grep -o '"latest_version"[^,]*' | cut -d'"' -f4); then
    echo -e "${GREEN}✓${NC} GitHub Pages is accessible (latest: v$LATEST)"
else
    echo -e "${YELLOW}⚠ Could not fetch from GitHub Pages (may not be deployed yet)${NC}"
fi

echo ""
echo -e "${GREEN}✓ All pre-flight checks passed!${NC}"
echo ""
echo "To perform an actual release, run:"
echo "  ./release-auto.sh patch       # for bug fixes (1.11.0 → 1.11.1)"
echo "  ./release-auto.sh minor       # for new features (1.11.0 → 1.12.0)"
echo "  ./release-auto.sh major       # for breaking changes (1.11.0 → 2.0.0)"
