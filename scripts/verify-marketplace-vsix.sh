#!/usr/bin/env bash

set -euo pipefail

version="${1:-}"
expected_vsix="${2:-}"
attempts="${MARKETPLACE_VSIX_ATTEMPTS:-5}"

if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid Marketplace release version: '$version'." >&2
    exit 2
fi
if [ ! -f "$expected_vsix" ]; then
    echo "Expected committed VSIX is missing." >&2
    exit 2
fi
if [[ ! "$attempts" =~ ^[1-9][0-9]*$ ]]; then
    echo "MARKETPLACE_VSIX_ATTEMPTS must be a positive integer." >&2
    exit 2
fi

marketplace_url="https://marketplace.visualstudio.com/_apis/public/gallery/publishers/EnterpriseAI/vsextensions/gofer/$version/vspackage"
downloaded_vsix="$(mktemp)"
manifest_file="$(mktemp)"
# Invoked indirectly by the trap below.
# shellcheck disable=SC2329
cleanup() {
    rm -f "$downloaded_vsix" "$manifest_file"
}
trap cleanup EXIT INT TERM HUP

for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl --fail --silent --show-error --location --compressed "$marketplace_url" --output "$downloaded_vsix" \
        && unzip -tqq "$downloaded_vsix" >/dev/null 2>&1 \
        && unzip -p "$downloaded_vsix" extension/package.json >"$manifest_file" \
        && EXPECTED_VERSION="$version" node - "$manifest_file" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (manifest.version !== process.env.EXPECTED_VERSION) process.exit(1);
NODE
    then
        if cmp --silent "$expected_vsix" "$downloaded_vsix"; then
            echo "Marketplace EnterpriseAI.gofer v$version is byte-identical to the committed VSIX."
            exit 0
        fi
    fi

    if [ "$attempt" -lt "$attempts" ]; then
        sleep 10
    fi
done

echo "Marketplace EnterpriseAI.gofer v$version does not match the committed VSIX bytes." >&2
exit 1
