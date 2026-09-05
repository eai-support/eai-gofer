#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo -e "${BLUE}ℹ ${NC}$1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

is_truthy() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

resolve_github_repo() {
    local remote_url
    remote_url=$(git config --get remote.origin.url 2>/dev/null || true)

    case "$remote_url" in
        git@github.com:*)
            echo "${remote_url#git@github.com:}" | sed 's/\.git$//'
            ;;
        https://github.com/*)
            echo "${remote_url#https://github.com/}" | sed 's/\.git$//'
            ;;
        *)
            echo "eai-support/eai-gofer"
            ;;
    esac
}

latest_release_tag() {
    git ls-remote --tags --refs origin 'v*' \
        | awk '{print $2}' \
        | sed 's#refs/tags/##' \
        | sort -V \
        | tail -n 1
}

version_gt() {
    local left="${1:-0.0.0}"
    local right="${2:-0.0.0}"

    LEFT="$left" RIGHT="$right" node <<'EOF'
const left = (process.env.LEFT || '0.0.0').replace(/^v/, '');
const right = (process.env.RIGHT || '0.0.0').replace(/^v/, '');
const parse = (value) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
const [la, lb, lc] = parse(left);
const [ra, rb, rc] = parse(right);
if (la !== ra) process.exit(la > ra ? 0 : 1);
if (lb !== rb) process.exit(lb > rb ? 0 : 1);
if (lc !== rc) process.exit(lc > rc ? 0 : 1);
process.exit(1);
EOF
}

remote_tag_exists() {
    local tag_name="$1"
    git ls-remote --tags origin "refs/tags/${tag_name}" | grep -q .
}

local_tag_exists() {
    local tag_name="$1"
    git rev-parse "$tag_name" >/dev/null 2>&1
}

ensure_no_stale_local_tag() {
    local tag_name="$1"
    if local_tag_exists "$tag_name" && ! remote_tag_exists "$tag_name"; then
        print_error "Local tag $tag_name exists but has not been pushed"
        print_error "Delete or move the stale local tag before publishing this release."
        exit 1
    fi
}

ensure_no_existing_release_pr() {
    local branch_name="$1"
    local repo="${GITHUB_REPO:-$(resolve_github_repo)}"
    local existing_pr
    existing_pr="$(gh pr list --repo "$repo" --head "$branch_name" --state all --json url --jq '.[0].url // ""')"
    if [ -n "$existing_pr" ]; then
        print_error "Release branch $branch_name already has a PR: $existing_pr"
        exit 1
    fi
}

create_release_pr() {
    local branch_name="$1"
    local version="$2"
    local notes="$3"
    local repo="${GITHUB_REPO:-$(resolve_github_repo)}"
    local body

    body=$(cat <<EOF
## Release Prep

- bumps Gofer to \`$version\`
- refreshes generated command surfaces and public release assets
- prepares \`main\` so a follow-up \`./release.sh\` run can publish tag \`v$version\`

## Release Notes

$notes
EOF
)

    gh pr create \
        --repo "$repo" \
        --base main \
        --head "$branch_name" \
        --title "chore: release v$version — $notes" \
        --body "$body"
}

should_enforce_vscode_marketplace_publish() {
    is_truthy "${ENFORCE_VSCODE_MARKETPLACE_PUBLISH:-}"
}

ensure_vscode_marketplace_publish_ready() {
    if is_truthy "${SKIP_VSCODE_MARKETPLACE_PUBLISH:-}"; then
        print_warning "Skipping VS Code Marketplace publish checks because SKIP_VSCODE_MARKETPLACE_PUBLISH is set."
        return 0
    fi

    if ! command -v gh >/dev/null 2>&1; then
        if should_enforce_vscode_marketplace_publish; then
            print_error "gh is required to verify VS Code Marketplace publishing configuration."
            exit 1
        fi

        print_warning "gh is not available, so VS Code Marketplace publishing readiness could not be verified."
        print_warning "Core public release assets will still be published."
        return 0
    fi

    has_github_config_name() {
        local names="$1"
        local expected_name="$2"
        printf '%s\n' "$names" | grep -qx "$expected_name"
    }

    local repo
    repo="${GITHUB_REPO:-$(resolve_github_repo)}"

    if ! gh auth status >/dev/null 2>&1; then
        if should_enforce_vscode_marketplace_publish; then
            print_error "gh is not authenticated. Authenticate before running a public release."
            exit 1
        fi

        print_warning "gh is not authenticated, so VS Code Marketplace publishing readiness could not be verified."
        print_warning "Core public release assets will still be published."
        return 0
    fi

    local github_variables
    github_variables="$(gh variable list --repo "$repo" 2>/dev/null | awk '{print $1}' || true)"

    if has_github_config_name "$github_variables" "VSCE_AZURE_CLIENT_ID" \
        && has_github_config_name "$github_variables" "VSCE_AZURE_TENANT_ID" \
        && has_github_config_name "$github_variables" "VSCE_AZURE_SUBSCRIPTION_ID"; then
        print_success "VS Code Marketplace Entra workload identity variables are configured for $repo"
        return 0
    fi

    if should_enforce_vscode_marketplace_publish; then
        print_error "Stable releases must publish EnterpriseAI.gofer to the Visual Studio Marketplace."
        print_error "Configure VSCE_AZURE_CLIENT_ID, VSCE_AZURE_TENANT_ID, and VSCE_AZURE_SUBSCRIPTION_ID repository variables for an Entra workload identity that is a Contributor on the EnterpriseAI Marketplace publisher."
        print_error "Only bypass this for an intentional dry/internal release with SKIP_VSCODE_MARKETPLACE_PUBLISH=1."
        exit 1
    fi

    print_warning "No VS Code Marketplace Entra workload identity variables were found for $repo."
    print_warning "Core public release assets will still be published."
}

wait_for_release_workflow() {
    local version="$1"
    local tag_name="v$version"
    local repo="${GITHUB_REPO:-$(resolve_github_repo)}"
    local run_id=""

    if is_truthy "${SKIP_RELEASE_WORKFLOW_WAIT:-}"; then
        print_warning "Skipping release workflow wait because SKIP_RELEASE_WORKFLOW_WAIT is set."
        return 0
    fi

    print_info "Waiting for GitHub release workflow for $tag_name..."
    for i in {1..30}; do
        run_id=$(gh run list \
            --repo "$repo" \
            --workflow release.yml \
            --branch "$tag_name" \
            --limit 1 \
            --json databaseId \
            --jq '.[0].databaseId // ""' 2>/dev/null || true)

        if [ -n "$run_id" ]; then
            break
        fi

        print_info "Release workflow has not started yet... (attempt $i/30)"
        sleep 10
    done

    if [ -z "$run_id" ]; then
        print_error "Could not find release workflow run for $tag_name."
        print_error "Check: https://github.com/$repo/actions/workflows/release.yml"
        exit 1
    fi

    print_info "Watching release workflow run $run_id..."
    if gh run watch "$run_id" --repo "$repo" --exit-status; then
        print_success "GitHub release workflow completed successfully"
    else
        print_error "GitHub release workflow failed for $tag_name"
        gh run view "$run_id" --repo "$repo" --log-failed || true
        exit 1
    fi
}

get_vscode_marketplace_version() {
    (cd extension && npx @vscode/vsce show EnterpriseAI.gofer --json 2>/tmp/eai-gofer-vsce-show.log) \
        | node -e "const fs=require('fs'); const input=fs.readFileSync(0,'utf8'); if (!input.trim()) process.exit(1); const data=JSON.parse(input); console.log(data.versions?.[0]?.version || '')"
}

verify_vscode_marketplace_version() {
    local expected_version="$1"
    local deployed_version=""

    if is_truthy "${SKIP_VSCODE_MARKETPLACE_PUBLISH:-}"; then
        print_warning "Skipping VS Code Marketplace version verification because SKIP_VSCODE_MARKETPLACE_PUBLISH is set."
        return 0
    fi

    print_info "Verifying Visual Studio Marketplace EnterpriseAI.gofer is at v$expected_version..."
    for i in {1..30}; do
        deployed_version=$(get_vscode_marketplace_version || echo "")

        if [ "$deployed_version" = "$expected_version" ]; then
            print_success "VS Code Marketplace is published at v$deployed_version"
            return 0
        fi

        print_info "Waiting for Marketplace propagation... (attempt $i/30, deployed: ${deployed_version:-MISSING}, expected: $expected_version)"
        sleep 20
    done

    if should_enforce_vscode_marketplace_publish; then
        print_error "VS Code Marketplace did not update to v$expected_version."
        print_error "Current Marketplace version: ${deployed_version:-MISSING}"
        print_error "Inspect publish logs: https://github.com/${GITHUB_REPO:-$(resolve_github_repo)}/actions/workflows/release.yml"
        exit 1
    fi

    print_warning "VS Code Marketplace did not update to v$expected_version."
    print_warning "Current Marketplace version: ${deployed_version:-MISSING}"
    print_warning "The GitHub Release and public Gofer feed are authoritative for eai gofer refresh."
    print_warning "Inspect publish logs: https://github.com/${GITHUB_REPO:-$(resolve_github_repo)}/actions/workflows/release.yml"
}

ensure_release_paths_tracked() {
    local missing=0

    for tracked_path in "$@"; do
        if git ls-files --error-unmatch "$tracked_path" >/dev/null 2>&1; then
            continue
        fi

        print_error "Required public release asset is not tracked by git: $tracked_path"
        missing=1
    done

    if [ "$missing" -ne 0 ]; then
        print_error "Public release binaries must be committed so GitHub Pages can publish them."
        print_error "Check .gitignore and release asset mirroring before retrying."
        exit 1
    fi
}

repo_has_changes() {
    [ -n "$(git status --porcelain)" ]
}

fail_release_validation() {
    local label="$1"
    print_error "$label failed."
    print_error "No release PR or tag was created."
    print_error "Fix the failure in a normal PR, get CI green, merge it to main, then rerun release.sh."
    exit 1
}

run_release_check() {
    local label="$1"
    shift

    print_info "$label..."
    if "$@"; then
        print_success "$label passed"
    else
        fail_release_validation "$label"
    fi
}

install_release_dependencies() {
    print_info "Installing root dependencies..."
    if npm install 2>&1; then
        print_success "Root dependencies installed"
    else
        fail_release_validation "Root dependency installation"
    fi

    print_info "Installing extension dependencies..."
    if npm --prefix extension install 2>&1; then
        print_success "Extension dependencies installed"
    else
        fail_release_validation "Extension dependency installation"
    fi

    print_info "Installing language-server dependencies..."
    if npm --prefix language-server install 2>&1; then
        print_success "Language-server dependencies installed"
    else
        fail_release_validation "Language-server dependency installation"
    fi
}

ensure_language_server_release_runtime() {
    if [ ! -f "extension/language-server/dist/server.js" ]; then
        print_error "The VS Code release runtime is missing extension/language-server/dist/server.js."
        print_error "Run npm --prefix extension run prepare-language-server and retry."
        fail_release_validation "Language Server release runtime check"
    fi

    if [ ! -f "extension/language-server/package.json" ]; then
        print_error "The VS Code release runtime is missing extension/language-server/package.json."
        fail_release_validation "Language Server release runtime check"
    fi

    if [ ! -d "extension/language-server/node_modules/vscode-languageserver" ]; then
        print_error "The VS Code release runtime is missing language-server dependencies."
        fail_release_validation "Language Server release runtime check"
    fi

    print_success "Language Server release runtime is present"
}

resolve_eai_app_template_dir() {
    if [ -n "${EAI_APP_TEMPLATE_DIR:-}" ]; then
        echo "$EAI_APP_TEMPLATE_DIR"
        return 0
    fi

    if [ -f "../eai-app-template/package.json" ]; then
        echo "../eai-app-template"
        return 0
    fi

    echo ""
}

run_eai_app_template_release_gate() {
    if is_truthy "${SKIP_EAI_APP_TEMPLATE_RELEASE_CHECK:-}"; then
        print_warning "Skipping EAI app-template release checks because SKIP_EAI_APP_TEMPLATE_RELEASE_CHECK is set."
        return 0
    fi

    local template_dir
    local temp_template_root=""
    template_dir="$(resolve_eai_app_template_dir)"

    if [ -z "$template_dir" ]; then
        temp_template_root="$(mktemp -d)"
        template_dir="$temp_template_root/eai-app-template"
        print_info "No local EAI app-template checkout found. Cloning eai-support/eai-app-template for release checks..."
        if git clone --depth 1 https://github.com/eai-support/eai-app-template.git "$template_dir"; then
            print_success "Cloned EAI app-template for release checks"
        else
            fail_release_validation "EAI app-template clone"
        fi
    fi

    if [ ! -f "$template_dir/package.json" ]; then
        print_error "EAI app-template package.json was not found at: $template_dir"
        fail_release_validation "EAI app-template release checks"
    fi

    print_info "Running EAI app-template release checks from $template_dir..."
    run_release_check "EAI app-template dependency install" npm --prefix "$template_dir" install --ignore-scripts
    run_release_check "EAI app-template Playwright browser install" npm --prefix "$template_dir" exec -- playwright install chromium
    run_release_check "EAI app-template verify" npm --prefix "$template_dir" run verify --silent
    run_release_check "EAI app-template smoke tests" npm --prefix "$template_dir" run test:smoke
    run_release_check "EAI app-template business-scenario browser tests" npm --prefix "$template_dir" run test:business-scenarios
    run_release_check "EAI app-template e2e browser tests" npm --prefix "$template_dir" run test:e2e

    if [ -n "$temp_template_root" ]; then
        rm -rf "$temp_template_root"
    fi
}

run_release_validation_gate() {
    local version="$1"

    print_info "Running release validation gate for Gofer v$version..."
    run_release_check "Gofer typecheck" npm run typecheck
    run_release_check "Gofer production build" npm run build
    run_release_check "Gofer generated surface check" npm run gofer:generate:check
    run_release_check "Gofer all-surface release contract" npm run gofer:surface-release:check -- --version "$version"
    run_release_check "Gofer unit test suite" npm run test:unit
    run_release_check "Language Server production build" npm --prefix language-server run build
    run_release_check "VS Code Language Server prepublish sync" npm --prefix extension run prepare-language-server
    ensure_language_server_release_runtime
    run_release_check "VS Code extension runtime test suite" npm --prefix extension test
    run_release_check "VS Code production package build" npm --prefix extension run package
    run_eai_app_template_release_gate
    print_success "Release validation gate passed for Gofer v$version"
}

ensure_release_base() {
    print_info "Fetching origin/main..."
    git fetch origin main

    if [ "$CURRENT_BRANCH" != "main" ]; then
        print_error "release.sh must be run from main after a PR merge."
        exit 1
    fi

    if git merge-base --is-ancestor origin/main HEAD; then
        return 0
    fi

    if repo_has_changes; then
        print_error "Local main is behind origin/main and the working tree is not clean."
        print_error "Fast-forward main first, then rerun the release."
        exit 1
    fi

    if git merge-base --is-ancestor HEAD origin/main; then
        print_info "Fast-forwarding local main to origin/main..."
        git pull --ff-only origin main
        return 0
    fi

    if ! git merge-base --is-ancestor origin/main HEAD; then
        print_error "Local main has diverged from origin/main."
        print_error "Rebase or merge origin/main before releasing."
        exit 1
    fi
}

load_env_file() {
    local env_line
    local env_key
    local env_value

    while IFS= read -r env_line || [ -n "$env_line" ]; do
        case "$env_line" in
            ''|\#*)
                continue
                ;;
            *=*)
                env_key=${env_line%%=*}
                env_value=${env_line#*=}
                env_value=${env_value%$'\r'}

                if [[ ! "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
                    print_warning "Skipping invalid .env key: $env_key"
                    continue
                fi

                if [[ "$env_value" == \"*\" && "$env_value" == *\" ]]; then
                    env_value=${env_value:1:-1}
                elif [[ "$env_value" == \'*\' && "$env_value" == *\' ]]; then
                    env_value=${env_value:1:-1}
                fi

                printf -v "$env_key" '%s' "$env_value"
                export "$env_key"
                ;;
            *)
                print_warning "Skipping malformed .env line"
                ;;
        esac
    done < ".env"
}

# Load environment variables from .env file if it exists without evaluating
# shell expansions from file contents.
if [ -f ".env" ]; then
    load_env_file
fi

# Check if release type is provided
if [ -z "$1" ]; then
    print_error "Usage: ./release.sh [patch|minor|major] [optional: release notes]"
    echo ""
    echo "Examples:"
    echo "  ./release.sh patch  # Auto-bump and release"
    echo "  ./release.sh minor 'Add new feature'"
    echo "  ./release.sh major 'Breaking changes'"
    exit 1
fi

RELEASE_TYPE=$1
COMMIT_MSG="${2:-Auto-release}"
# Preserve the user-provided release notes — auto-commit logic may overwrite COMMIT_MSG
RELEASE_NOTES="$COMMIT_MSG"

# Validate release type
if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid release type. Must be: patch, minor, or major"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "extension/package.json" ]; then
    print_error "Must be run from the repository root"
    exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
GITHUB_REPO=${GITHUB_REPO:-$(resolve_github_repo)}
ensure_release_base
ensure_vscode_marketplace_publish_ready

if repo_has_changes; then
    print_error "Working tree is dirty. Commit or stash changes first."
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./extension/package.json').version")
print_info "Current version: $CURRENT_VERSION"
LATEST_TAG="$(latest_release_tag)"
LATEST_TAG_VERSION="${LATEST_TAG#v}"

if version_gt "$CURRENT_VERSION" "${LATEST_TAG_VERSION:-0.0.0}"; then
    RELEASE_PHASE="publish"
    NEW_VERSION="$CURRENT_VERSION"
else
    RELEASE_PHASE="prepare"
fi

if [ "$RELEASE_PHASE" = "publish" ]; then
    print_info "Release mode: publish merged main"
    TAG_NAME="v$CURRENT_VERSION"

    print_info "Re-verifying eai update refresh compatibility before tagging..."
    if node scripts/verify-eai-refresh-layout.mjs 2>&1; then
        print_success "EAI refresh layout is complete"
    else
        print_error "Gofer cannot produce the resource layout required by eai update"
        exit 1
    fi

    ensure_release_paths_tracked \
        "docs-site/static/releases/eai-gofer-$CURRENT_VERSION.vsix" \
        "docs-site/static/releases/eai-gofer-latest.vsix" \
        "docs-site/static/releases/eai-gofer-agent-plugin-$CURRENT_VERSION.zip" \
        "docs-site/static/releases/eai-gofer-agent-plugin-latest.zip"

    install_release_dependencies
    run_release_validation_gate "$CURRENT_VERSION"

    if remote_tag_exists "$TAG_NAME"; then
        print_error "Remote tag $TAG_NAME already exists"
        exit 1
    fi
    ensure_no_stale_local_tag "$TAG_NAME"

    print_info "Creating release tag $TAG_NAME from merged main..."
    git tag "$TAG_NAME"

    print_info "Pushing tag $TAG_NAME..."
    if git push --no-verify origin "$TAG_NAME"; then
        print_success "Pushed tag $TAG_NAME"
    else
        print_error "Failed to push tag $TAG_NAME"
        exit 1
    fi

    wait_for_release_workflow "$CURRENT_VERSION"
    verify_vscode_marketplace_version "$CURRENT_VERSION"

    VSIX_URL="https://eai-support.github.io/eai-gofer/releases/eai-gofer-$CURRENT_VERSION.vsix"
    print_info "Verifying GitHub Pages release asset..."
    HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$VSIX_URL?cachebust=$(date +%s)")
    if [ "$HTTP_STATUS" = "200" ]; then
        print_success "VSIX file is accessible (HTTP $HTTP_STATUS)"
    else
        print_warning "VSIX file returned HTTP $HTTP_STATUS - GitHub Pages may still be deploying"
    fi

    echo ""
    print_success "Released Gofer v$CURRENT_VERSION from merged main"
    exit 0
fi

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $RELEASE_TYPE in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
print_success "New version: $NEW_VERSION"
RELEASE_BRANCH="release/v$NEW_VERSION"

if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
    print_error "Local branch $RELEASE_BRANCH already exists"
    exit 1
fi
if git ls-remote --heads origin "$RELEASE_BRANCH" | grep -q .; then
    print_error "Remote branch $RELEASE_BRANCH already exists"
    exit 1
fi
ensure_no_existing_release_pr "$RELEASE_BRANCH"

# Update package.json (both root and extension)
print_info "Updating package.json files..."
node -e "
const fs = require('fs');

// Update extension package.json
const extPkg = JSON.parse(fs.readFileSync('./extension/package.json', 'utf8'));
extPkg.version = '$NEW_VERSION';
fs.writeFileSync('./extension/package.json', JSON.stringify(extPkg, null, 2) + '\n');

// Update root package.json
const rootPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
rootPkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(rootPkg, null, 2) + '\n');

// Keep Gofer workspace version marker aligned with the released extension version.
if (fs.existsSync('./.specify')) {
    fs.writeFileSync('./.specify/.gofer-version', '$NEW_VERSION\n');
}

// Keep lockfile package metadata aligned with release version when present.
for (const lockPath of ['./package-lock.json', './extension/package-lock.json']) {
    if (!fs.existsSync(lockPath)) continue;
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = '$NEW_VERSION';
    if (lock.packages && lock.packages['']) {
        lock.packages[''].version = '$NEW_VERSION';
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
"

# Update CHANGELOG with placeholder
CURRENT_DATE=$(date +%Y-%m-%d)
print_info "Updating CHANGELOG.md..."

TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << EOF
# Changelog

All notable changes to the Gofer extension will be documented in this file.

## [$NEW_VERSION] - $CURRENT_DATE

$RELEASE_NOTES

EOF

awk '/^## \[/{f=1} f' extension/CHANGELOG.md >> "$TEMP_FILE"
mv "$TEMP_FILE" extension/CHANGELOG.md

print_success "Updated package.json, .gofer-version, and CHANGELOG.md"

# Ensure root generation tools are installed before invoking generators such as
# generate-commands, which depends on root dev tooling like tsx.
print_info "Installing root dependencies for generation..."
if npm install 2>&1; then
    print_success "Root dependencies installed"
else
    print_error "Failed to install root dependencies"
    exit 1
fi

# Pre-release hook (FR-001, NFR-011): regenerate every CLI surface from the
# canonical .specify/commands/<stage>.md source-of-truth so the published
# artifact is always source-of-truth-derived. MUST run before
# sync-extension-resources.mjs, otherwise the VSIX may bundle stale emitters.
print_info "Running gofer:generate to ensure published artifact is source-of-truth-derived..."
if npm run gofer:generate 2>&1; then
    print_success "gofer:generate completed"
else
    print_error "gofer:generate failed"
    exit 1
fi

print_info "Running generate-commands to refresh downstream mirrors..."
if npm run generate-commands -- --verbose 2>&1; then
    print_success "generate-commands completed"
else
    print_error "generate-commands failed"
    exit 1
fi

# Sync extension/resources/ from canonical sources BEFORE packaging the VSIX.
# Without this, edits to .claude/commands/, .github/prompts/, .specify/
# never reach end users — the installer ships from extension/resources/.
print_info "Syncing extension/resources/ from canonical sources..."
if node .specify/scripts/node/sync-extension-resources.mjs 2>&1; then
    print_success "Extension resources synced"
else
    print_error "Failed to sync extension resources"
    exit 1
fi

print_info "Verifying eai update refresh compatibility..."
if npm run gofer:eai-refresh-layout:check 2>&1; then
    print_success "EAI refresh layout is complete"
else
    print_error "Gofer cannot produce the resource layout required by eai update"
    exit 1
fi

# Build VSIX
print_info "Building VSIX package..."
cd extension

# Ensure all production dependencies are installed (needed for vsce package)
print_info "Installing extension dependencies..."
if npm install 2>&1; then
    print_success "Dependencies installed"
else
    print_error "Failed to install extension dependencies"
    cd ..
    exit 1
fi

# Ensure language-server dependencies are installed before prepublish build.
print_info "Installing language-server dependencies..."
if (cd ../language-server && npm install 2>&1); then
    print_success "Language-server dependencies installed"
else
    print_error "Failed to install language-server dependencies"
    cd ..
    exit 1
fi

# Ensure language-server is up to date
print_info "Syncing language-server files..."
rsync -av --delete ../language-server/ ./language-server/ \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.DS_Store'

# Compile TypeScript before packaging
print_info "Compiling TypeScript..."
if npm run compile 2>&1; then
    print_success "TypeScript compilation successful"
else
    print_error "Failed to compile TypeScript"
    cd ..
    exit 1
fi

# No native rebuild is required; the extension runtime is bundled by webpack and
# language-server dependencies are copied explicitly before VSIX packaging.
print_info "No native rebuild required for VSIX packaging"
print_success "Skipping native rebuild"

# Run vsce package and capture both success and failure. Dependencies used by
# the extension runtime are bundled by webpack; language-server dependencies
# are explicitly included through .vscodeignore.
if npx @vscode/vsce package --no-dependencies --out "eai-gofer-$NEW_VERSION.vsix" 2>&1; then
    print_success "VSIX package built successfully"
else
    print_error "Failed to build VSIX package"
    cd ..
    exit 1
fi

cd ..

# Move VSIX file and verify it exists
if [ -f "extension/eai-gofer-$NEW_VERSION.vsix" ]; then
    mv "extension/eai-gofer-$NEW_VERSION.vsix" "./eai-gofer-$NEW_VERSION.vsix"
    print_success "Built eai-gofer-$NEW_VERSION.vsix"
else
    print_error "VSIX file was not created: extension/eai-gofer-$NEW_VERSION.vsix"
    exit 1
fi

# Build the portable Claude/Codex/Copilot plugin bundle that will be mirrored
# to the same public GitHub Pages release host as the VSIX.
print_info "Packaging Claude/Codex/Copilot agent plugin..."
if npm run gofer:package-plugin -- --version "$NEW_VERSION" --sync-repo 2>&1; then
    print_success "Agent plugin bundle packaged"
else
    print_error "Failed to package the agent plugin bundle"
    exit 1
fi

# Validate VSIX native-module posture. Gofer no longer packages native PTY
# modules, so the safest public artifact is one with no native build byproducts.
print_info "Validating VSIX native dependency posture..."
VSIX_FILE="./eai-gofer-$NEW_VERSION.vsix"

# Check for stale native PTY dependencies.
if unzip -l "$VSIX_FILE" | grep -q "node-pty-prebuilt-multiarch"; then
    print_error "✗ CRITICAL: stale node-pty-prebuilt-multiarch files are present in the VSIX."
    print_error "  Gofer no longer uses PTY-native modules; remove them before releasing."
    exit 1
else
    print_success "✓ No stale node-pty native dependency files packaged"
fi

# CRITICAL: Ensure no disallowed platform-specific build artifacts are included.
PTY_BUILD_ARTIFACTS=$(unzip -l "$VSIX_FILE" | grep "build/Release/pty.node" || true)
if [ -n "$PTY_BUILD_ARTIFACTS" ]; then
    print_error "✗ CRITICAL: platform-specific build/Release/pty.node detected!"
    echo "$PTY_BUILD_ARTIFACTS"
    exit 1
else
    print_success "✓ No platform-specific build artifacts detected"
fi

if unzip -p "$VSIX_FILE" extension/package.json | grep -q "node-pty"; then
    print_error "✗ CRITICAL: stale node-pty dependency metadata found in VSIX package.json"
    exit 1
fi

print_success "Native dependency validation passed"

# Test VSIX activation before releasing
print_info "Running VSIX pre-flight tests including activation..."
if [ -f "./test-vsix.sh" ]; then
    if ./test-vsix.sh "./eai-gofer-$NEW_VERSION.vsix" --test-activation; then
        print_success "VSIX passed all pre-flight tests including activation"
    else
        print_error "VSIX failed pre-flight tests!"
        print_error "Extension failed to activate or tests failed."
        print_error "Fix the issues above before releasing."
        exit 1
    fi
else
    print_error "test-vsix.sh not found! Cannot verify VSIX."
    exit 1
fi

# Test all extension commands to ensure they don't throw undefined errors
print_info "Testing all extension commands for runtime errors..."
if [ -f "./test-commands.sh" ]; then
    # VSIX is already installed by test-vsix.sh above

    # Command tests are a hard release gate.
    if ./test-commands.sh 2>&1 | tee /tmp/command-test.log; then
        print_success "All extension commands validated successfully"
    else
        print_error "Some extension commands had issues (see /tmp/command-test.log)"
        fail_release_validation "Extension command validation"
    fi
else
    print_error "test-commands.sh not found, cannot validate extension commands"
    fail_release_validation "Extension command validation"
fi

# Ensure root validation tools are installed before lint/test gates. Fresh
# release worktrees do not have root node_modules by default.
install_release_dependencies

# Run release validation BEFORE committing, pushing, or opening a release PR.
run_release_validation_gate "$NEW_VERSION"

echo ""
print_success "Pre-push validation complete"

# Update GitHub Pages releases.json and mirror the release artifacts into the
# public Pages host so VS Code, Claude, and Codex all update from one place.
print_info "Updating GitHub Pages releases.json..."
if [ -f "scripts/update-releases.js" ]; then
    node scripts/update-releases.js "$NEW_VERSION" "$RELEASE_NOTES"
    print_success "Updated GitHub Pages release feed"
else
    print_warning "GitHub Pages update script not found, skipping..."
fi

print_info "Publishing VSIX + agent plugin artifacts to GitHub Pages..."
if [ -f "scripts/publish-public-release-assets.mjs" ]; then
    node scripts/publish-public-release-assets.mjs "$NEW_VERSION"
    print_success "Published public release assets"
else
    print_warning "Public release publisher not found, skipping asset mirroring..."
fi

# Commit
print_info "Committing changes..."
git add -A
ensure_release_paths_tracked \
    "docs-site/static/releases/eai-gofer-$NEW_VERSION.vsix" \
    "docs-site/static/releases/eai-gofer-latest.vsix" \
    "docs-site/static/releases/eai-gofer-agent-plugin-$NEW_VERSION.zip" \
    "docs-site/static/releases/eai-gofer-agent-plugin-latest.zip"

git commit --no-verify -m "release: v$NEW_VERSION

$RELEASE_NOTES

🤖 Generated with release.sh

Co-Authored-By: Claude <noreply@anthropic.com>
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

print_info "Creating release branch..."
git checkout -b "$RELEASE_BRANCH"
print_success "Created branch $RELEASE_BRANCH"

print_info "Pushing release branch..."
git push --no-verify -u origin "$RELEASE_BRANCH"
PR_URL="$(create_release_pr "$RELEASE_BRANCH" "$NEW_VERSION" "$RELEASE_NOTES")"
print_success "Release prep PR created: $PR_URL"

echo ""
print_success "Prepared release PR for Gofer v$NEW_VERSION"
print_info "Merge $PR_URL, fast-forward main, then rerun ./release.sh $RELEASE_TYPE \"$RELEASE_NOTES\" to publish tag v$NEW_VERSION from merged main."
exit 0

# Post-release verification: these checks are informational only and must never
# abort the script (release artifacts are already pushed at this point).
set +e

# Verify the public release assets are actually downloadable from GitHub Pages
VSIX_URL="https://eai-support.github.io/eai-gofer/releases/eai-gofer-$NEW_VERSION.vsix"
AGENT_PLUGIN_URL="https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-$NEW_VERSION.zip"
CLAUDE_MARKETPLACE_URL="https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/claude-marketplace.json"
CODEX_PLUGIN_URL="https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/codex-plugin.json"
GEMINI_EXTENSION_URL="https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gemini-extension.json"
print_info "Verifying VSIX is downloadable at: $VSIX_URL"
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$VSIX_URL?cachebust=$(date +%s)")
if [ "$HTTP_STATUS" = "200" ]; then
    print_success "VSIX file is accessible (HTTP $HTTP_STATUS)"
else
    print_warning "VSIX file returned HTTP $HTTP_STATUS - users may not be able to auto-update"
    print_warning "Check GitHub Pages deployment: https://eai-support.github.io/eai-gofer/releases"
fi

print_info "Verifying agent plugin zip is downloadable at: $AGENT_PLUGIN_URL"
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$AGENT_PLUGIN_URL?cachebust=$(date +%s)")
if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Agent plugin zip is accessible (HTTP $HTTP_STATUS)"
else
    print_warning "Agent plugin zip returned HTTP $HTTP_STATUS - Claude/Codex users may not be able to download updates"
fi

print_info "Verifying Claude marketplace metadata is reachable at: $CLAUDE_MARKETPLACE_URL"
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$CLAUDE_MARKETPLACE_URL?cachebust=$(date +%s)")
if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Claude marketplace metadata is accessible (HTTP $HTTP_STATUS)"
else
    print_warning "Claude marketplace metadata returned HTTP $HTTP_STATUS"
fi

print_info "Verifying Codex plugin manifest is reachable at: $CODEX_PLUGIN_URL"
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$CODEX_PLUGIN_URL?cachebust=$(date +%s)")
if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Codex plugin manifest is accessible (HTTP $HTTP_STATUS)"
else
    print_warning "Codex plugin manifest returned HTTP $HTTP_STATUS"
fi

print_info "Verifying Gemini extension manifest is reachable at: $GEMINI_EXTENSION_URL"
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$GEMINI_EXTENSION_URL?cachebust=$(date +%s)")
if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Gemini extension manifest is accessible (HTTP $HTTP_STATUS)"
else
    print_warning "Gemini extension manifest returned HTTP $HTTP_STATUS"
fi

# Simulate auto-updater flow (what other VSCode instances will do)
print_info "Simulating auto-update flow for other VSCode instances..."
RELEASES_JSON=$(curl -s "https://eai-support.github.io/eai-gofer/releases.json?cachebust=$(date +%s)")

# Parse latest_version (try/catch guards against malformed JSON from partial deployment)
REMOTE_VERSION=$(echo "$RELEASES_JSON" | node -e "try { const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.latest_version || 'MISSING'); } catch(e) { console.log('MISSING'); }" 2>/dev/null || echo "MISSING")
# Parse download_url for this version
REMOTE_URL=$(echo "$RELEASES_JSON" | NEW_VERSION="$NEW_VERSION" node -e "try { const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); const v=process.env.NEW_VERSION; const r=j.releases?.find(r=>r.version===v); console.log(r?.download_url || 'MISSING'); } catch(e) { console.log('MISSING'); }" 2>/dev/null || echo "MISSING")
REMOTE_CLAUDE_URL=$(echo "$RELEASES_JSON" | NEW_VERSION="$NEW_VERSION" node -e "try { const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); const v=process.env.NEW_VERSION; const r=j.releases?.find(r=>r.version===v); console.log(r?.assets?.claude?.marketplace_url || 'MISSING'); } catch(e) { console.log('MISSING'); }" 2>/dev/null || echo "MISSING")
REMOTE_CODEX_URL=$(echo "$RELEASES_JSON" | NEW_VERSION="$NEW_VERSION" node -e "try { const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); const v=process.env.NEW_VERSION; const r=j.releases?.find(r=>r.version===v); console.log(r?.assets?.codex?.manifest_url || 'MISSING'); } catch(e) { console.log('MISSING'); }" 2>/dev/null || echo "MISSING")
REMOTE_GEMINI_URL=$(echo "$RELEASES_JSON" | NEW_VERSION="$NEW_VERSION" node -e "try { const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); const v=process.env.NEW_VERSION; const r=j.releases?.find(r=>r.version===v); console.log(r?.assets?.gemini?.manifest_url || 'MISSING'); } catch(e) { console.log('MISSING'); }" 2>/dev/null || echo "MISSING")

SIMULATION_PASS=true
if [ "$REMOTE_VERSION" = "$NEW_VERSION" ]; then
    print_success "Auto-updater will detect version $NEW_VERSION"
else
    print_warning "Auto-updater version mismatch: expected $NEW_VERSION, got $REMOTE_VERSION"
    SIMULATION_PASS=false
fi

if [ "$REMOTE_URL" = "$VSIX_URL" ]; then
    print_success "Auto-updater download URL is correct"
else
    print_warning "Auto-updater download URL mismatch: expected $VSIX_URL, got $REMOTE_URL"
    SIMULATION_PASS=false
fi

if [ "$REMOTE_CLAUDE_URL" = "$CLAUDE_MARKETPLACE_URL" ]; then
    print_success "Claude marketplace URL is correct"
else
    print_warning "Claude marketplace URL mismatch: expected $CLAUDE_MARKETPLACE_URL, got $REMOTE_CLAUDE_URL"
    SIMULATION_PASS=false
fi

if [ "$REMOTE_CODEX_URL" = "$CODEX_PLUGIN_URL" ]; then
    print_success "Codex plugin URL is correct"
else
    print_warning "Codex plugin URL mismatch: expected $CODEX_PLUGIN_URL, got $REMOTE_CODEX_URL"
    SIMULATION_PASS=false
fi

if [ "$REMOTE_GEMINI_URL" = "$GEMINI_EXTENSION_URL" ]; then
    print_success "Gemini extension URL is correct"
else
    print_warning "Gemini extension URL mismatch: expected $GEMINI_EXTENSION_URL, got $REMOTE_GEMINI_URL"
    SIMULATION_PASS=false
fi

if [ "$SIMULATION_PASS" = "true" ]; then
    print_success "Auto-update simulation passed - other VSCode instances will update correctly"
else
    print_warning "Auto-update simulation had issues - check GitHub Pages deployment"
fi

set -e

print_success "🎉 Release $NEW_VERSION complete!"
echo ""
print_success "Extension Update:"
echo "  • Users can now update to v$NEW_VERSION via the extension's update button"
echo "  • Download URL: https://eai-support.github.io/eai-gofer/releases/eai-gofer-$NEW_VERSION.vsix"
echo ""
print_success "Agent Plugin Update:"
echo "  • Shared public bundle directory: https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer"
echo "  • Agent plugin zip: https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-$NEW_VERSION.zip"
echo "  • Public repo install source: https://github.com/eai-support/eai-gofer"
echo "  • Claude repo marketplace path: .claude-plugin + plugins/eai-gofer"
echo "  • Codex repo marketplace path: .agents/plugins + plugins/eai-gofer"
echo "  • Copilot repo marketplace path: .github/plugin + plugins/eai-gofer"
echo "  • Gemini manifest: https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gemini-extension.json"
echo ""
print_info "GitHub Resources:"
echo "  • Releases: https://github.com/eai-support/eai-gofer/releases"
echo "  • Actions: https://github.com/eai-support/eai-gofer/actions"
echo "  • GitHub Pages: https://eai-support.github.io/eai-gofer/"
echo ""
print_info "Local VSIX file: ./eai-gofer-$NEW_VERSION.vsix"
print_info "Local agent plugin zip: ./dist/eai-gofer-agent-plugin-$NEW_VERSION.zip"
