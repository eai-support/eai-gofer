#!/usr/bin/env bash

set -euo pipefail

version="${1:-}"
tag_name="${2:-}"
output_path="${3:-}"
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]] \
    || [ "$tag_name" != "v$version" ] \
    || [ -z "$output_path" ]; then
    echo "Usage: create-release-archive.sh <version> <v-version> <output.tar.gz>" >&2
    exit 2
fi

archive_root="$(mktemp -d)"
# Invoked indirectly by the trap below.
# shellcheck disable=SC2329
cleanup() {
    rm -rf "$archive_root"
}
trap cleanup EXIT INT TERM HUP

release_assets="$archive_root/release-assets"
mkdir -p "$release_assets/orchestrator" "$release_assets/extension" "$release_assets/language-server"

ORCHESTRATOR_SOURCE="$(pwd)/dist" ORCHESTRATOR_TARGET="$release_assets/orchestrator" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const source = process.env.ORCHESTRATOR_SOURCE;
const target = process.env.ORCHESTRATOR_TARGET;
fs.cpSync(source, target, {
  recursive: true,
  filter(candidate) {
    if (candidate === source) return true;
    const relative = path.relative(source, candidate);
    return !(
      !relative.includes(path.sep) &&
      path.basename(relative).startsWith('eai-gofer-agent-plugin-')
    );
  },
});
NODE
cp -R extension/dist/. "$release_assets/extension/"
cp -R language-server/dist/. "$release_assets/language-server/"
cp "docs-site/static/releases/eai-gofer-$version.vsix" "$release_assets/"
cp "docs-site/static/releases/eai-gofer-agent-plugin-$version.zip" "$release_assets/"
cp README.md CHANGELOG.md LICENSE "$release_assets/"
source_date_epoch="$(git show -s --format=%ct HEAD)"
ARCHIVE_CONTENT_ROOT="$release_assets" SOURCE_DATE_EPOCH="$source_date_epoch" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.ARCHIVE_CONTENT_ROOT;
const timestamp = Number(process.env.SOURCE_DATE_EPOCH);
if (!root || !Number.isSafeInteger(timestamp) || timestamp < 0) {
  throw new Error('Invalid deterministic archive timestamp.');
}

function normalize(candidate) {
  const stats = fs.lstatSync(candidate);
  if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
    throw new Error(`Release archive input must be a regular file or directory: ${candidate}`);
  }
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(candidate).sort()) {
      normalize(path.join(candidate, entry));
    }
    fs.chmodSync(candidate, 0o755);
  } else {
    fs.chmodSync(candidate, 0o644);
  }
  fs.utimesSync(candidate, timestamp, timestamp);
}

normalize(root);
NODE

if tar --version 2>&1 | grep -q '^tar (GNU tar)'; then
    tar --sort=name \
        --mtime="@$source_date_epoch" \
        --owner=0 \
        --group=0 \
        --numeric-owner \
        --mode='u+rwX,go+rX,go-w' \
        --format=posix \
        --pax-option=delete=atime,delete=ctime \
        -cf - \
        -C "$archive_root" \
        release-assets | gzip -n > "$output_path"
else
    # bsdtar has no --sort=name. Feed it a canonical, non-recursive path list;
    # metadata and mtimes were normalized above and gzip -n removes clock data.
    archive_list="$archive_root/archive-paths.txt"
    (
        cd "$archive_root"
        find release-assets -print | LC_ALL=C sort > "$archive_list"
        COPYFILE_DISABLE=1 tar \
            --format=ustar \
            --uid 0 \
            --gid 0 \
            --uname root \
            --gname root \
            --no-recursion \
            -cf - \
            -T "$archive_list"
    ) | gzip -n > "$output_path"
fi
