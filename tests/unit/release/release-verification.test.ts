import { readFileSync } from 'fs';
import * as path from 'path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

/**
 * Tests for release verification logic used by release.sh.
 *
 * These tests validate the same parsing logic the release script uses
 * (via `node -e`) to verify that releases.json is correct after deployment.
 */

interface ReleaseEntry {
  version: string;
  tag_name: string;
  download_url: string;
  notes: string;
  prerelease: boolean;
  size_mb: number;
}

interface ReleasesJson {
  latest_version: string;
  repository: string;
  releases: ReleaseEntry[];
}

/** Extracts latest_version from releases.json (mirrors release.sh logic) */
function extractLatestVersion(json: ReleasesJson): string {
  return json.latest_version || 'MISSING';
}

/** Extracts download_url for a specific version (mirrors release.sh logic) */
function extractDownloadUrl(json: ReleasesJson, version: string): string {
  const release = json.releases?.find((r) => r.version === version);
  return release?.download_url || 'MISSING';
}

/** Builds expected VSIX URL from version (mirrors release.sh logic) */
function buildExpectedVsixUrl(version: string): string {
  return `https://eai-support.github.io/eai-gofer/releases/eai-gofer-${version}.vsix`;
}

const VALID_RELEASES_JSON: ReleasesJson = {
  latest_version: '1.16.1',
  repository: 'eai-support/eai-gofer',
  releases: [
    {
      version: '1.16.1',
      tag_name: 'v1.16.1',
      download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-1.16.1.vsix',
      notes: 'Fix validation findings',
      prerelease: false,
      size_mb: 30.3,
    },
    {
      version: '1.16.0',
      tag_name: 'v1.16.0',
      download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-1.16.0.vsix',
      notes: 'Auto-generate AI instruction files',
      prerelease: false,
      size_mb: 30.3,
    },
  ],
};

const RELEASE_SCRIPT = readFileSync(path.resolve(__dirname, '../../../release.sh'), 'utf-8');
const RELEASE_WORKFLOW = readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/release.yml'),
  'utf-8'
);
const CI_WORKFLOW = readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/ci.yml'),
  'utf-8'
);
const PAGES_WORKFLOW = readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/pages.yml'),
  'utf-8'
);
const RELEASE_PAGE = readFileSync(
  path.resolve(__dirname, '../../../docs-site/src/pages/releases.js'),
  'utf-8'
);

describe('Release Verification', () => {
  describe('extractLatestVersion', () => {
    it('should extract latest_version from valid releases.json', () => {
      expect(extractLatestVersion(VALID_RELEASES_JSON)).toBe('1.16.1');
    });

    it('should return MISSING when latest_version is empty', () => {
      const json = { ...VALID_RELEASES_JSON, latest_version: '' };
      expect(extractLatestVersion(json)).toBe('MISSING');
    });

    it('should return MISSING when latest_version is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = { ...VALID_RELEASES_JSON, latest_version: undefined as any };
      expect(extractLatestVersion(json)).toBe('MISSING');
    });

    it('should return MISSING when latest_version is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = { ...VALID_RELEASES_JSON, latest_version: null as any };
      expect(extractLatestVersion(json)).toBe('MISSING');
    });
  });

  describe('extractDownloadUrl', () => {
    it('should extract download_url for an existing version', () => {
      const url = extractDownloadUrl(VALID_RELEASES_JSON, '1.16.1');
      expect(url).toBe('https://eai-support.github.io/eai-gofer/releases/eai-gofer-1.16.1.vsix');
    });

    it('should extract download_url for an older version', () => {
      const url = extractDownloadUrl(VALID_RELEASES_JSON, '1.16.0');
      expect(url).toBe('https://eai-support.github.io/eai-gofer/releases/eai-gofer-1.16.0.vsix');
    });

    it('should return MISSING for a version not in releases', () => {
      const url = extractDownloadUrl(VALID_RELEASES_JSON, '99.99.99');
      expect(url).toBe('MISSING');
    });

    it('should return MISSING when releases array is empty', () => {
      const json = { ...VALID_RELEASES_JSON, releases: [] };
      expect(extractDownloadUrl(json, '1.16.1')).toBe('MISSING');
    });

    it('should return MISSING when releases is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = { ...VALID_RELEASES_JSON, releases: undefined as any };
      expect(extractDownloadUrl(json, '1.16.1')).toBe('MISSING');
    });

    it('should return MISSING when releases is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = { ...VALID_RELEASES_JSON, releases: null as any };
      expect(extractDownloadUrl(json, '1.16.1')).toBe('MISSING');
    });
  });

  describe('buildExpectedVsixUrl', () => {
    it('should build correct GitHub Pages release URL from version', () => {
      expect(buildExpectedVsixUrl('1.16.1')).toBe(
        'https://eai-support.github.io/eai-gofer/releases/eai-gofer-1.16.1.vsix'
      );
    });

    it('should handle major version bumps', () => {
      expect(buildExpectedVsixUrl('2.0.0')).toBe(
        'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.0.0.vsix'
      );
    });
  });

  describe('version mismatch detection', () => {
    it('should detect when latest_version matches expected', () => {
      const expected = '1.16.1';
      const actual = extractLatestVersion(VALID_RELEASES_JSON);
      expect(actual).toBe(expected);
    });

    it('should detect version mismatch', () => {
      const expected = '2.0.0';
      const actual = extractLatestVersion(VALID_RELEASES_JSON);
      expect(actual).not.toBe(expected);
    });
  });

  describe('download URL validation', () => {
    it('should match expected URL when releases.json is correct', () => {
      const version = '1.16.1';
      const expectedUrl = buildExpectedVsixUrl(version);
      const actualUrl = extractDownloadUrl(VALID_RELEASES_JSON, version);
      expect(actualUrl).toBe(expectedUrl);
    });

    it('should detect URL mismatch when download_url points elsewhere', () => {
      const json: ReleasesJson = {
        ...VALID_RELEASES_JSON,
        releases: [
          {
            ...VALID_RELEASES_JSON.releases[0],
            download_url:
              'https://github.com/eai-support/eai-gofer/releases/download/v1.16.1/eai-gofer-1.16.1.vsix',
          },
        ],
      };
      const expectedUrl = buildExpectedVsixUrl('1.16.1');
      const actualUrl = extractDownloadUrl(json, '1.16.1');
      expect(actualUrl).not.toBe(expectedUrl);
    });
  });

  describe('release orchestration order', () => {
    it('should regenerate canonical and downstream mirrors before syncing packaged resources', () => {
      const goferGenerateIndex = RELEASE_SCRIPT.indexOf('npm run gofer:generate 2>&1');
      const generateCommandsIndex = RELEASE_SCRIPT.indexOf(
        'npm run generate-commands -- --verbose 2>&1'
      );
      const syncResourcesIndex = RELEASE_SCRIPT.indexOf(
        'node .specify/scripts/node/sync-extension-resources.mjs 2>&1'
      );
      const eaiRefreshLayoutIndex = RELEASE_SCRIPT.indexOf(
        'npm run gofer:eai-refresh-layout:check 2>&1'
      );
      const compileIndex = RELEASE_SCRIPT.indexOf('if npm run compile 2>&1; then');
      const packageIndex = RELEASE_SCRIPT.indexOf('npx @vscode/vsce package');
      const publishModeIndex = RELEASE_SCRIPT.indexOf('if [ "$RELEASE_PHASE" = "publish" ]; then');
      const publishLayoutIndex = RELEASE_SCRIPT.indexOf(
        'node scripts/verify-eai-refresh-layout.mjs 2>&1',
        publishModeIndex
      );
      const pushTagIndex = RELEASE_SCRIPT.indexOf(
        'git push --no-verify origin "$TAG_NAME"',
        publishModeIndex
      );

      expect(goferGenerateIndex).toBeGreaterThan(-1);
      expect(generateCommandsIndex).toBeGreaterThan(goferGenerateIndex);
      expect(syncResourcesIndex).toBeGreaterThan(generateCommandsIndex);
      expect(eaiRefreshLayoutIndex).toBeGreaterThan(syncResourcesIndex);
      expect(compileIndex).toBeGreaterThan(eaiRefreshLayoutIndex);
      expect(packageIndex).toBeGreaterThan(compileIndex);
      expect(publishLayoutIndex).toBeGreaterThan(publishModeIndex);
      expect(pushTagIndex).toBeGreaterThan(publishLayoutIndex);
      expect(RELEASE_SCRIPT).not.toContain('./scripts/sync-extension-resources.sh');
    });

    it('should load .env entries without command-substitution parsing', () => {
      expect(RELEASE_SCRIPT).toContain('load_env_file()');
      expect(RELEASE_SCRIPT).toContain('printf -v "$env_key" \'%s\' "$env_value"');
      expect(RELEASE_SCRIPT).not.toContain('export $(cat .env');
    });

    it('should use deterministic installs for release-owned lockfiles', () => {
      expect(RELEASE_SCRIPT).toContain('if npm ci 2>&1; then');
      expect(RELEASE_SCRIPT).toContain('if npm --prefix extension ci 2>&1; then');
      expect(RELEASE_SCRIPT).toContain('if npm --prefix language-server ci 2>&1; then');
      expect(RELEASE_SCRIPT).toContain('if (cd ../language-server && npm ci 2>&1); then');
      expect(RELEASE_SCRIPT).not.toContain('if npm install 2>&1; then');
      expect(RELEASE_SCRIPT).not.toContain('npm --prefix extension install 2>&1');
      expect(RELEASE_SCRIPT).not.toContain('npm --prefix language-server install 2>&1');
    });

    it('should preserve release notes when rebuilding extension changelog entries', () => {
      const preserveNotesIndex = RELEASE_SCRIPT.indexOf('RELEASE_NOTES="$COMMIT_MSG"');
      const changelogInsertIndex = RELEASE_SCRIPT.indexOf('$RELEASE_NOTES');
      const changelogAppendIndex = RELEASE_SCRIPT.indexOf(
        'awk \'/^## \\[/{f=1} f\' extension/CHANGELOG.md >> "$TEMP_FILE"'
      );

      expect(preserveNotesIndex).toBeGreaterThan(-1);
      expect(changelogInsertIndex).toBeGreaterThan(preserveNotesIndex);
      expect(changelogAppendIndex).toBeGreaterThan(changelogInsertIndex);
    });

    it('should update and commit the .gofer-version marker during release bumps', () => {
      const goferVersionWriteIndex = RELEASE_SCRIPT.indexOf(
        "fs.writeFileSync('./.specify/.gofer-version', '$NEW_VERSION\\n');"
      );
      const gitAddIndex = RELEASE_SCRIPT.indexOf('.specify/.gofer-version');

      expect(goferVersionWriteIndex).toBeGreaterThan(-1);
      expect(gitAddIndex).toBeGreaterThan(goferVersionWriteIndex);
    });

    it('should fail before PR or tag when release validation fails', () => {
      expect(RELEASE_SCRIPT).toContain('fail_release_validation()');
      expect(RELEASE_SCRIPT).toContain('No release PR or tag was created.');
      expect(RELEASE_SCRIPT).toContain(
        'Fix the failure in a normal PR, get CI green, merge it to main, then rerun release.sh.'
      );
    });

    it('should run the full release validation gate before publishing', () => {
      expect(RELEASE_SCRIPT).toContain('run_release_validation_gate()');
      expect(RELEASE_SCRIPT).toContain('run_release_check "Gofer typecheck" npm run typecheck');
      expect(RELEASE_SCRIPT).toContain('run_release_check "Gofer production build" npm run build');
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "Gofer generated surface check" npm run gofer:generate:check'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "Gofer all-surface release contract" npm run gofer:surface-release:check -- --version "$version"'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "Gofer full Vitest suite" npm test'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "Language Server production build" npm --prefix language-server run build'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "VS Code Language Server prepublish sync" npm --prefix extension run prepare-language-server'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "VS Code extension runtime test suite" npm --prefix extension test'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "VS Code production package build" npm --prefix extension run package'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "EAI app-template Playwright browser install" npm --prefix "$template_dir" exec -- playwright install chromium'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "EAI app-template verify" npm --prefix "$template_dir" run verify --silent'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "EAI app-template smoke tests" npm --prefix "$template_dir" run test:smoke'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "EAI app-template business-scenario browser tests" npm --prefix "$template_dir" run test:business-scenarios'
      );
      expect(RELEASE_SCRIPT).toContain(
        'run_release_check "EAI app-template e2e browser tests" npm --prefix "$template_dir" run test:e2e'
      );
    });

    it('should make extension command validation fatal for releases', () => {
      expect(RELEASE_SCRIPT).toContain('fail_release_validation "Extension command validation"');
      expect(RELEASE_SCRIPT).not.toContain('Continuing with release - manual testing recommended');
    });

    it('should preserve the test-commands exit status when tee succeeds', () => {
      const functionStart = RELEASE_SCRIPT.indexOf('run_command_tests_with_log() {');
      const functionEnd = RELEASE_SCRIPT.indexOf(
        '\n}\n\ninstall_release_dependencies()',
        functionStart
      );
      expect(functionStart).toBeGreaterThan(-1);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const functionSource = RELEASE_SCRIPT.slice(functionStart, functionEnd + 2);
      const probe = spawnSync(
        'bash',
        [
          '-c',
          `probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
cd "$probe_dir"
printf '#!/bin/bash\nexit 23\n' > test-commands.sh
chmod +x test-commands.sh
${functionSource}
run_command_tests_with_log "$probe_dir/output.log"
status=$?
[ "$status" -eq 23 ]`,
        ],
        { encoding: 'utf8' }
      );

      expect(probe.status).toBe(0);
    });

    it('should allow enough time for Visual Studio Marketplace indexing', () => {
      expect(RELEASE_SCRIPT).toContain('VSCODE_MARKETPLACE_PROPAGATION_ATTEMPTS:-60');
      expect(RELEASE_SCRIPT).toContain('for ((i = 1; i <= max_attempts; i++)); do');
      expect(RELEASE_SCRIPT).toContain('sleep 20');
    });

    it('should not push directly to origin/main from release.sh', () => {
      const validationGateIndex = RELEASE_SCRIPT.indexOf(
        'run_release_validation_gate "$NEW_VERSION"'
      );
      const trackedAssetsIndex = RELEASE_SCRIPT.indexOf(
        'ensure_release_paths_tracked \\\n' +
          '    "docs-site/static/releases/eai-gofer-$NEW_VERSION.vsix"',
        validationGateIndex
      );
      const releaseCommitIndex = RELEASE_SCRIPT.indexOf(
        'git commit --no-verify -m "release: v$NEW_VERSION'
      );
      const pushBranchIndex = RELEASE_SCRIPT.indexOf(
        'git push --no-verify -u origin "$RELEASE_BRANCH"'
      );
      const pushTagIndex = RELEASE_SCRIPT.indexOf('git push --no-verify origin "$TAG_NAME"');

      expect(validationGateIndex).toBeGreaterThan(-1);
      expect(trackedAssetsIndex).toBeGreaterThan(validationGateIndex);
      expect(releaseCommitIndex).toBeGreaterThan(validationGateIndex);
      expect(releaseCommitIndex).toBeGreaterThan(trackedAssetsIndex);
      expect(pushBranchIndex).toBeGreaterThan(releaseCommitIndex);
      expect(pushTagIndex).toBeGreaterThan(-1);
      expect(RELEASE_SCRIPT).not.toContain('git push --no-verify origin HEAD:main');
      expect(RELEASE_SCRIPT).not.toContain('--force-with-lease');
    });

    it('should require exact origin/main identity and fast-forward only a behind local main', () => {
      expect(RELEASE_SCRIPT).toContain('local_head="$(git rev-parse HEAD)"');
      expect(RELEASE_SCRIPT).toContain('origin_head="$(git rev-parse origin/main)"');
      expect(RELEASE_SCRIPT).toContain('git merge-base --is-ancestor origin/main HEAD');
      expect(RELEASE_SCRIPT).toContain('git pull --ff-only origin main');
      expect(RELEASE_SCRIPT).toContain('Local main contains commits that are not on origin/main.');
    });

    it('should reject a clean local main that is ahead of origin/main', () => {
      const functionStart = RELEASE_SCRIPT.indexOf('ensure_release_base() {');
      const functionEnd = RELEASE_SCRIPT.indexOf('\n}\n\nload_env_file()', functionStart);
      expect(functionStart).toBeGreaterThan(-1);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const functionSource = RELEASE_SCRIPT.slice(functionStart, functionEnd + 2);
      const probe = spawnSync(
        'bash',
        [
          '-c',
          `set -e
probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
git init --bare --initial-branch=main "$probe_dir/origin.git" >/dev/null
git clone "$probe_dir/origin.git" "$probe_dir/work" >/dev/null 2>&1
cd "$probe_dir/work"
git config user.email release-test@example.invalid
git config user.name 'Release Test'
printf 'base\n' > state.txt
git add state.txt
git commit -m base >/dev/null
git push origin main >/dev/null 2>&1
printf 'local-only\n' >> state.txt
git commit -am local-only >/dev/null
print_info() { :; }
print_error() { printf '%s\n' "$1" >&2; }
repo_has_changes() { [ -n "$(git status --porcelain)" ]; }
CURRENT_BRANCH=main
${functionSource}
ensure_release_base`,
        ],
        { encoding: 'utf8' }
      );

      expect(probe.status).not.toBe(0);
      expect(probe.stderr).toContain('Local main contains commits that are not on origin/main.');
    });

    it('should fail closed when remote tag discovery fails', () => {
      const latestStart = RELEASE_SCRIPT.indexOf('latest_release_tag() {');
      const latestEnd = RELEASE_SCRIPT.indexOf('\n}\n\nversion_gt()', latestStart);
      const remoteStart = RELEASE_SCRIPT.indexOf('remote_tag_exists() {');
      const remoteEnd = RELEASE_SCRIPT.indexOf('\n}\n\nlocal_tag_exists()', remoteStart);
      const latestSource = RELEASE_SCRIPT.slice(latestStart, latestEnd + 2);
      const remoteSource = RELEASE_SCRIPT.slice(remoteStart, remoteEnd + 2);
      const common = `git() { return 42; }
print_error() { printf '%s\n' "$1" >&2; }`;

      const latestProbe = spawnSync(
        'bash',
        ['-c', `${common}\n${latestSource}\nlatest_release_tag`],
        {
          encoding: 'utf8',
        }
      );
      const remoteProbe = spawnSync(
        'bash',
        ['-c', `${common}\n${remoteSource}\nremote_tag_exists v9.9.9`],
        { encoding: 'utf8' }
      );

      expect(latestProbe.status).not.toBe(0);
      expect(latestProbe.stderr).toContain('refusing to infer release state');
      expect(remoteProbe.status).not.toBe(0);
      expect(remoteProbe.stderr).toContain('refusing to release');
    });

    it('should rank a stable tag above the same-base prerelease tag', () => {
      const latestStart = RELEASE_SCRIPT.indexOf('latest_release_tag() {');
      const latestEnd = RELEASE_SCRIPT.indexOf('\n}\n\nversion_gt()', latestStart);
      const latestSource = RELEASE_SCRIPT.slice(latestStart, latestEnd + 2);
      const probe = spawnSync(
        'bash',
        [
          '-c',
          `git() {
  printf '%s\\n' \\
    '1111111111111111111111111111111111111111 refs/tags/v4.0.0-beta.1' \\
    '2222222222222222222222222222222222222222 refs/tags/v3.99.0' \\
    '3333333333333333333333333333333333333333 refs/tags/v4.0.0'
}
print_error() { printf '%s\\n' "$1" >&2; }
${latestSource}
latest_release_tag`,
        ],
        { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }
      );

      expect(probe.status).toBe(0);
      expect(probe.stdout.trim()).toBe('v4.0.0');
    });

    it('should reject a stale workflow run when selecting the pushed tag run', () => {
      const selectorStart = RELEASE_SCRIPT.indexOf('select_release_workflow_run() {');
      const selectorEnd = RELEASE_SCRIPT.indexOf(
        '\n}\n\nwait_for_release_workflow()',
        selectorStart
      );
      expect(selectorStart).toBeGreaterThan(-1);
      expect(selectorEnd).toBeGreaterThan(selectorStart);
      const selectorSource = RELEASE_SCRIPT.slice(selectorStart, selectorEnd + 2);
      const expectedSha = '1'.repeat(40);
      const staleOnly = JSON.stringify([
        {
          databaseId: 41,
          event: 'push',
          headSha: expectedSha,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      const current = JSON.stringify([
        ...JSON.parse(staleOnly),
        {
          databaseId: 42,
          event: 'workflow_dispatch',
          headSha: expectedSha,
          createdAt: '2026-01-01T00:02:00.000Z',
        },
        {
          databaseId: 43,
          event: 'push',
          headSha: '2'.repeat(40),
          createdAt: '2026-01-01T00:02:00.000Z',
        },
        {
          databaseId: 44,
          event: 'push',
          headSha: expectedSha,
          createdAt: '2026-01-01T00:02:00.000Z',
        },
      ]);
      const sameSecond = JSON.stringify([
        {
          databaseId: 45,
          event: 'push',
          headSha: expectedSha,
          createdAt: '2026-01-01T00:01:00.000Z',
        },
      ]);
      const runProbe = (runs: string) =>
        spawnSync(
          'bash',
          [
            '-c',
            `${selectorSource}\nselect_release_workflow_run "$1" "$2" "$3"`,
            'release-run-probe',
            runs,
            expectedSha,
            '2026-01-01T00:01:00.999Z',
          ],
          { encoding: 'utf8' }
        );

      expect(runProbe(staleOnly).stdout).toBe('');
      expect(runProbe(current).stdout).toBe('44');
      expect(runProbe(sameSecond).stdout).toBe('45');
      expect(RELEASE_SCRIPT).toContain('--json databaseId,event,headSha,createdAt');
      expect(RELEASE_SCRIPT).toContain('RELEASE_TAG_PUSHED_AT="$(node -p');
    });

    it('should distinguish an absent remote branch from a failed branch lookup', () => {
      const functionStart = RELEASE_SCRIPT.indexOf('remote_branch_exists() {');
      const functionEnd = RELEASE_SCRIPT.indexOf('\n}\n\nlocal_tag_exists()', functionStart);
      const functionSource = RELEASE_SCRIPT.slice(functionStart, functionEnd + 2);
      const failureProbe = spawnSync(
        'bash',
        [
          '-c',
          `git() { return 42; }
print_error() { printf '%s\\n' "$1" >&2; }
${functionSource}
remote_branch_exists release/v9.9.9`,
        ],
        { encoding: 'utf8' }
      );
      const absentProbe = spawnSync(
        'bash',
        [
          '-c',
          `git() { return 2; }
print_error() { printf '%s\\n' "$1" >&2; }
${functionSource}
if remote_branch_exists release/v9.9.9; then exit 99; else exit 0; fi`,
        ],
        { encoding: 'utf8' }
      );

      expect(failureProbe.status).not.toBe(0);
      expect(failureProbe.stderr).toContain('Unable to determine whether remote branch');
      expect(absentProbe.status).toBe(0);
    });

    it('should fail closed on malformed or older remote release versions', () => {
      const stateStart = RELEASE_SCRIPT.indexOf('if ! LATEST_TAG="$(latest_release_tag)"; then');
      const stateEnd = RELEASE_SCRIPT.indexOf(
        '\nif [ "$RELEASE_PHASE" = "publish" ]; then',
        stateStart
      );
      const stateSource = RELEASE_SCRIPT.slice(stateStart, stateEnd);
      const runProbe = (latestTag: string) =>
        spawnSync(
          'bash',
          [
            '-c',
            `latest_release_tag() { printf '%s\\n' '${latestTag}'; }
print_error() { printf '%s\\n' "$1" >&2; }
CURRENT_VERSION=3.12.4
${stateSource}`,
          ],
          { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }
        );

      expect(runProbe('vnot-semver').status).not.toBe(0);
      const olderProbe = runProbe('v3.13.0');
      expect(olderProbe.status).not.toBe(0);
      expect(olderProbe.stderr).toContain('is behind the latest remote tag v3.13.0');
    });

    it('should detect dirty worktrees using git status porcelain output', () => {
      expect(RELEASE_SCRIPT).toContain('git status --porcelain');
      expect(RELEASE_SCRIPT).not.toContain('git diff-index --quiet HEAD --');
    });

    it('should update release feed assets only after repo validation passes', () => {
      const validationGateIndex = RELEASE_SCRIPT.indexOf(
        'run_release_validation_gate "$NEW_VERSION"'
      );
      const updateReleasesIndex = RELEASE_SCRIPT.indexOf(
        'node scripts/update-releases.js "$NEW_VERSION" "$RELEASE_NOTES"'
      );
      const publishAssetsIndex = RELEASE_SCRIPT.indexOf(
        'node scripts/publish-public-release-assets.mjs "$NEW_VERSION"'
      );
      const publicParityIndex = RELEASE_SCRIPT.indexOf(
        'npm run gofer:surface-release:check -- --version "$NEW_VERSION" --candidate --public'
      );

      expect(updateReleasesIndex).toBeGreaterThan(validationGateIndex);
      expect(publishAssetsIndex).toBeGreaterThan(updateReleasesIndex);
      expect(publicParityIndex).toBeGreaterThan(publishAssetsIndex);
    });

    it('should make published byte-integrity verification reachable before release success', () => {
      const publishModeIndex = RELEASE_SCRIPT.indexOf('if [ "$RELEASE_PHASE" = "publish" ]; then');
      const workflowWaitIndex = RELEASE_SCRIPT.indexOf(
        'wait_for_release_workflow "$CURRENT_VERSION"',
        publishModeIndex
      );
      const integrityIndex = RELEASE_SCRIPT.indexOf(
        'verify_published_release_integrity "$CURRENT_VERSION" "$PUBLISHED_TAR_PATH"',
        workflowWaitIndex
      );
      const successIndex = RELEASE_SCRIPT.indexOf(
        'Released Gofer v$CURRENT_VERSION from merged main',
        integrityIndex
      );

      expect(integrityIndex).toBeGreaterThan(workflowWaitIndex);
      expect(successIndex).toBeGreaterThan(integrityIndex);
      expect(RELEASE_SCRIPT).toContain('GitHub Release VSIX v$version');
      expect(RELEASE_SCRIPT).toContain('GitHub Pages latest agent plugin');
      expect(RELEASE_SCRIPT).toContain('GitHub Release archive v$version');
      expect(RELEASE_SCRIPT).toContain('gh run download "$RELEASE_WORKFLOW_RUN_ID"');
    });

    it('should propagate an early published-byte failure instead of masking it', () => {
      const functionStart = RELEASE_SCRIPT.indexOf('verify_published_release_integrity() {');
      const functionEnd = RELEASE_SCRIPT.indexOf(
        '\n}\n\nget_vscode_marketplace_version()',
        functionStart
      );
      expect(functionStart).toBeGreaterThan(-1);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const functionSource = RELEASE_SCRIPT.slice(functionStart, functionEnd + 2);
      const probe = spawnSync(
        'bash',
        [
          '-c',
          `probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
cd "$probe_dir"
mkdir -p docs-site/static/releases
touch docs-site/static/releases/eai-gofer-9.9.9.vsix
touch docs-site/static/releases/eai-gofer-agent-plugin-9.9.9.zip
touch release.tar.gz
print_error() { :; }
is_sha256() { [[ "\${1:-}" =~ ^[0-9a-f]{64}$ ]]; }
sha256_file() { printf '%064d\\n' 0; }
release_manifest_hash() { printf '%064d\\n' 0; }
verify_remote_hash() {
  if [ "$1" = "GitHub Pages VSIX v9.9.9" ]; then return 7; fi
  return 0
}
verify_remote_file_hash() { return 0; }
resolve_github_repo() { printf '%s\\n' eai-support/eai-gofer; }
${functionSource}
if verify_published_release_integrity 9.9.9 release.tar.gz; then exit 99; else exit 0; fi`,
        ],
        { encoding: 'utf8' }
      );

      expect(probe.status).toBe(0);
    });

    it('should reject missing local or remote hashes instead of accepting empty equality', () => {
      const remoteStart = RELEASE_SCRIPT.indexOf('verify_remote_hash() {');
      const remoteEnd = RELEASE_SCRIPT.indexOf('\n}\n\nverify_remote_file_hash()', remoteStart);
      expect(remoteStart).toBeGreaterThan(-1);
      expect(remoteEnd).toBeGreaterThan(remoteStart);
      const remoteSource = RELEASE_SCRIPT.slice(remoteStart, remoteEnd + 2);
      const probe = spawnSync(
        'bash',
        [
          '-c',
          `print_error() { :; }
print_info() { :; }
print_success() { :; }
sleep() { :; }
is_sha256() { [[ "\${1:-}" =~ ^[0-9a-f]{64}$ ]]; }
remote_sha256() { return 7; }
${remoteSource}
if verify_remote_hash remote https://example.invalid '' 2; then exit 91; fi
if verify_remote_hash remote https://example.invalid "$(printf '%064d' 0)" 2; then exit 92; fi
exit 0`,
        ],
        { encoding: 'utf8' }
      );

      expect(probe.status).toBe(0);
    });

    it('should retry and fail fast across every emitted public Pages alias', () => {
      for (const alias of [
        'claude-plugin.json',
        'claude-marketplace.json',
        'codex-plugin.json',
        'codex-marketplace.json',
        'copilot-plugin.json',
        'copilot-marketplace.json',
        'gemini-extension.json',
        'gemini-commands-manifest.json',
        'gofer-surface-update.mjs',
        'gofer-local-settings-cleanup.mjs',
      ]) {
        const aliasIndex = RELEASE_SCRIPT.indexOf(
          `https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/${alias}`
        );
        expect(aliasIndex).toBeGreaterThan(-1);
        expect(RELEASE_SCRIPT.slice(aliasIndex, aliasIndex + 300)).toContain('30 || return 1');
        expect(RELEASE_WORKFLOW).toContain(`releases/plugins/eai-gofer/${alias}|`);
      }
      expect(RELEASE_WORKFLOW).toContain(
        'releases/eai-gofer-$RELEASE_VERSION.vsix|docs-site/static/releases/eai-gofer-$RELEASE_VERSION.vsix'
      );
      expect(RELEASE_WORKFLOW).toContain('releases.json|docs-site/static/releases.json');
    });

    it('should fail closed when VSIX enumeration or manifest extraction fails', () => {
      expect(RELEASE_SCRIPT).toContain('if ! VSIX_ENTRIES="$(unzip -Z1 "$VSIX_FILE")"; then');
      expect(RELEASE_SCRIPT).toContain(
        'if ! VSIX_PACKAGE_JSON="$(unzip -p "$VSIX_FILE" extension/package.json)"; then'
      );
      expect(RELEASE_SCRIPT).not.toMatch(/unzip[^\n]*\|[^\n]*grep/);
      const vscodeIgnore = readFileSync(
        path.resolve(__dirname, '../../../extension/.vscodeignore'),
        'utf8'
      );
      expect(vscodeIgnore).toContain('language-server/node_modules/fsevents/**');
      expect(vscodeIgnore).toContain('**/*.node');
    });

    it('should validate merged main before pushing the release tag', () => {
      const publishModeIndex = RELEASE_SCRIPT.indexOf('if [ "$RELEASE_PHASE" = "publish" ]; then');
      const publishGateIndex = RELEASE_SCRIPT.indexOf(
        'run_release_validation_gate "$CURRENT_VERSION"',
        publishModeIndex
      );
      const committedParityIndex = RELEASE_SCRIPT.indexOf(
        'npm run gofer:surface-release:check -- --version "$CURRENT_VERSION" --public',
        publishGateIndex
      );
      const trackedCleanIndex = RELEASE_SCRIPT.indexOf(
        '"Merged release tracked tree cleanliness"',
        committedParityIndex
      );
      const stagedCleanIndex = RELEASE_SCRIPT.indexOf(
        '"Merged release staged tree cleanliness"',
        trackedCleanIndex
      );
      const createTagIndex = RELEASE_SCRIPT.indexOf('git tag "$TAG_NAME"', stagedCleanIndex);
      const pushTagIndex = RELEASE_SCRIPT.indexOf(
        'git push --no-verify origin "$TAG_NAME"',
        publishModeIndex
      );

      expect(publishGateIndex).toBeGreaterThan(publishModeIndex);
      expect(committedParityIndex).toBeGreaterThan(publishGateIndex);
      expect(trackedCleanIndex).toBeGreaterThan(committedParityIndex);
      expect(stagedCleanIndex).toBeGreaterThan(trackedCleanIndex);
      expect(createTagIndex).toBeGreaterThan(stagedCleanIndex);
      expect(pushTagIndex).toBeGreaterThan(createTagIndex);
      expect(RELEASE_SCRIPT.slice(trackedCleanIndex, stagedCleanIndex)).toContain(
        'git diff --exit-code'
      );
      expect(RELEASE_SCRIPT.slice(stagedCleanIndex, createTagIndex)).toContain(
        'git diff --cached --exit-code'
      );
    });

    it('should stage the full release diff before creating the release commit', () => {
      const releaseBranchIndex = RELEASE_SCRIPT.indexOf('git checkout -b "$RELEASE_BRANCH"');
      const gitAddIndex = RELEASE_SCRIPT.indexOf('git add -A');
      const releaseCommitIndex = RELEASE_SCRIPT.indexOf(
        'git commit --no-verify -m "release: v$NEW_VERSION'
      );

      expect(releaseBranchIndex).toBeGreaterThan(-1);
      expect(gitAddIndex).toBeGreaterThan(releaseBranchIndex);
      expect(gitAddIndex).toBeGreaterThan(-1);
      expect(releaseCommitIndex).toBeGreaterThan(gitAddIndex);
      expect(RELEASE_SCRIPT).toContain('check out main, run git pull --ff-only origin main');
      expect(RELEASE_SCRIPT).not.toContain(
        'git add package.json package-lock.json extension/package.json extension/package-lock.json'
      );
    });

    it('should attach the agent plugin zip to the GitHub release alongside the VSIX', () => {
      expect(RELEASE_WORKFLOW).toContain(
        'docs-site/static/releases/eai-gofer-${{ needs.validate.outputs.version }}.vsix'
      );
      expect(RELEASE_WORKFLOW).toContain(
        'docs-site/static/releases/eai-gofer-agent-plugin-${{ needs.validate.outputs.version }}.zip'
      );
    });

    it('should verify the exact public host feed and label the compatibility manifest as Antigravity', () => {
      expect(RELEASE_SCRIPT).toContain(
        "const expectedHosts = ['claude', 'codex', 'copilot', 'antigravity', 'grok', 'vscode'];"
      );
      expect(RELEASE_SCRIPT).toContain('GitHub Pages Antigravity compatibility manifest');
      expect(RELEASE_SCRIPT).not.toContain('assets?.gemini');
      expect(RELEASE_SCRIPT).not.toContain('Gemini extension');
      expect(RELEASE_PAGE).toContain(
        'const antigravityAsset = assets.antigravity || assets.gemini'
      );
      expect(RELEASE_PAGE).toContain('Open Antigravity Legacy Compatibility Manifest');
      expect(RELEASE_PAGE).not.toContain('Open Gemini Manifest');
    });

    it('should keep GitHub release workflow aligned with the local release gate', () => {
      expect(RELEASE_WORKFLOW).toContain('Checkout EAI App Template');
      expect(RELEASE_WORKFLOW).toContain('npm --prefix eai-app-template ci');
      expect(RELEASE_WORKFLOW).toContain('npm run gofer:generate:check');
      expect(RELEASE_WORKFLOW).toContain('git diff --exit-code');
      expect(RELEASE_WORKFLOW).not.toContain('run: npm run gofer:generate\n');
      expect(RELEASE_WORKFLOW).toContain(
        'npm run gofer:surface-release:check -- --version "${{ steps.version.outputs.version }}" --candidate'
      );
      expect(RELEASE_WORKFLOW).toContain(
        'npm run gofer:surface-release:check -- --version "${{ steps.version.outputs.version }}" --candidate --public'
      );
      expect(RELEASE_WORKFLOW).toContain('npm run typecheck');
      expect(RELEASE_WORKFLOW).toContain('npm run test:unit');
      expect(RELEASE_WORKFLOW).toContain('npm --prefix extension run prepare-language-server');
      expect(RELEASE_WORKFLOW).toContain('xvfb-run -a npm --prefix extension test');
      expect(RELEASE_WORKFLOW).toContain(
        'npm --prefix eai-app-template exec -- playwright install --with-deps chromium'
      );
      expect(RELEASE_WORKFLOW).toContain('npm --prefix eai-app-template run verify --silent');
      expect(RELEASE_WORKFLOW).toContain('npm --prefix eai-app-template run test:smoke');
      expect(RELEASE_WORKFLOW).toContain(
        'npm --prefix eai-app-template run test:business-scenarios'
      );
      expect(RELEASE_WORKFLOW).toContain('npm --prefix eai-app-template run test:e2e');
      expect(RELEASE_WORKFLOW).toContain('Build Components');
      expect(RELEASE_WORKFLOW).toContain('npm run build');
      expect(RELEASE_WORKFLOW).toContain('npm --prefix language-server run build');
      expect(RELEASE_WORKFLOW).toContain(
        'agy plugin install https://github.com/eai-support/eai-gofer'
      );
      expect(RELEASE_WORKFLOW).toContain(
        'grok plugin install --trust https://github.com/eai-support/eai-gofer'
      );
      expect(RELEASE_WORKFLOW).not.toContain(
        'gemini extensions install https://github.com/eai-support/eai-gofer'
      );
      expect(RELEASE_WORKFLOW).toContain(
        'docs-site/static/releases/eai-gofer-${{ needs.validate.outputs.version }}.vsix'
      );
      expect(RELEASE_WORKFLOW).toContain(
        'docs-site/static/releases/eai-gofer-agent-plugin-${{ needs.validate.outputs.version }}.zip'
      );
      expect(RELEASE_WORKFLOW).toContain(
        '--packagePath "../docs-site/static/releases/eai-gofer-${{ needs.validate.outputs.version }}.vsix"'
      );
      expect(RELEASE_WORKFLOW).toContain(
        '--out "eai-gofer-${{ steps.version.outputs.version }}.vsix"'
      );
      expect(RELEASE_WORKFLOW).toContain('Protect Existing GitHub Release Assets');
      expect(RELEASE_WORKFLOW.match(/## Public Agent Plugin Install/g)).toHaveLength(1);
      expect(RELEASE_WORKFLOW).toContain(
        "if: steps.github_release_preflight.outputs.exists != 'true'"
      );
      expect(RELEASE_WORKFLOW).toContain(
        'gh api "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG"'
      );
      expect(RELEASE_WORKFLOW).toContain("grep -q 'HTTP 404'");
      expect(RELEASE_WORKFLOW).toContain(
        'Unable to determine whether $RELEASE_TAG already exists; refusing to publish.'
      );
      expect(RELEASE_WORKFLOW).toContain('cmp --silent');
      expect(RELEASE_WORKFLOW).toContain('overwrite_files: false');
      expect(RELEASE_WORKFLOW).toContain('fail_on_unmatched_files: true');
      expect(RELEASE_WORKFLOW).toContain('name: Verify Published GitHub Release Assets');
      expect(RELEASE_WORKFLOW).toContain('name: Verify Deployed GitHub Pages Release');
    });

    it('should pin the template and every privileged workflow action to immutable commits', () => {
      const templateRef = readFileSync(
        path.resolve(__dirname, '../../../.release/eai-app-template-ref'),
        'utf8'
      ).trim();
      expect(templateRef).toMatch(/^[0-9a-f]{40}$/);
      expect(RELEASE_SCRIPT).toContain(
        'template_commit="$(tr -d \'\\r\\n\' < .release/eai-app-template-ref)"'
      );
      expect(RELEASE_SCRIPT).toContain('checkout --detach FETCH_HEAD');
      expect(RELEASE_WORKFLOW).toContain('ref: ${{ steps.app_template.outputs.commit }}');
      expect(RELEASE_WORKFLOW.match(/persist-credentials: false/g)?.length).toBeGreaterThanOrEqual(
        4
      );
      const actionUses = [...RELEASE_WORKFLOW.matchAll(/^\s*uses:\s*([^\s]+)$/gm)].map(
        (match) => match[1]
      );
      expect(actionUses.length).toBeGreaterThan(0);
      for (const action of actionUses) {
        expect(action).toMatch(/@[0-9a-f]{40}$/);
      }
      expect(RELEASE_WORKFLOW).toContain('# actions/checkout v6');
      expect(RELEASE_WORKFLOW).toContain('# actions/setup-node v6');
      expect(RELEASE_WORKFLOW).toContain('# azure/login v2');
      expect(RELEASE_WORKFLOW).toContain('# softprops/action-gh-release v3');
    });

    it('should isolate validation from GitHub-write and Marketplace-OIDC authority', () => {
      const validateStart = RELEASE_WORKFLOW.indexOf('  validate:');
      const githubStart = RELEASE_WORKFLOW.indexOf('  publish_github:');
      const marketplaceStart = RELEASE_WORKFLOW.indexOf('  publish_marketplace:');
      const validateBlock = RELEASE_WORKFLOW.slice(validateStart, githubStart);
      const githubBlock = RELEASE_WORKFLOW.slice(githubStart, marketplaceStart);
      const marketplaceBlock = RELEASE_WORKFLOW.slice(marketplaceStart);

      expect(validateBlock).toContain('contents: read');
      expect(validateBlock).not.toContain('contents: write');
      expect(validateBlock).not.toContain('id-token: write');
      expect(githubBlock).toContain('contents: write');
      expect(githubBlock).not.toContain('id-token: write');
      expect(githubBlock).not.toContain('npm ci');
      expect(marketplaceBlock).toContain('contents: read');
      expect(marketplaceBlock).toContain('id-token: write');
      expect(marketplaceBlock).not.toContain('npm run ');
      expect(marketplaceBlock).toContain('npm --prefix extension ci --ignore-scripts');
    });

    it('should validate candidate and committed bytes separately without overwriting either', () => {
      const resolveIndex = RELEASE_WORKFLOW.indexOf('name: Resolve Release Version');
      const checkoutIndex = RELEASE_WORKFLOW.indexOf('name: Checkout Repository');
      const checkoutVerificationIndex = RELEASE_WORKFLOW.indexOf(
        'name: Verify Release Tag Checkout'
      );
      const candidatePackageIndex = RELEASE_WORKFLOW.indexOf(
        '--out "eai-gofer-${{ steps.version.outputs.version }}.vsix"'
      );
      const candidateCheckIndex = RELEASE_WORKFLOW.indexOf(
        'name: Verify Candidate All-Surface Release Contract'
      );
      const publicCheckIndex = RELEASE_WORKFLOW.indexOf(
        'name: Verify Candidate-to-Committed Semantic Release Parity'
      );
      const finalTreeCheckIndex = RELEASE_WORKFLOW.indexOf(
        'name: Verify Tagged Tree Remains Unmodified'
      );
      const archiveIndex = RELEASE_WORKFLOW.indexOf('name: Create Release Archive');
      const publicVerificationBlock = RELEASE_WORKFLOW.slice(publicCheckIndex, archiveIndex);
      const githubReleaseIndex = RELEASE_WORKFLOW.indexOf('name: Publish GitHub Release');

      expect(resolveIndex).toBeGreaterThan(-1);
      expect(checkoutIndex).toBeGreaterThan(resolveIndex);
      expect(checkoutVerificationIndex).toBeGreaterThan(checkoutIndex);
      expect(candidatePackageIndex).toBeGreaterThan(checkoutVerificationIndex);
      expect(candidatePackageIndex).toBeGreaterThan(-1);
      expect(candidateCheckIndex).toBeGreaterThan(candidatePackageIndex);
      expect(publicCheckIndex).toBeGreaterThan(candidateCheckIndex);
      expect(finalTreeCheckIndex).toBeGreaterThan(publicCheckIndex);
      expect(archiveIndex).toBeGreaterThan(finalTreeCheckIndex);
      expect(githubReleaseIndex).toBeGreaterThan(publicCheckIndex);
      expect(RELEASE_WORKFLOW).not.toContain('ci-eai-gofer-');
      expect(publicVerificationBlock).not.toContain(
        'cp "docs-site/static/releases/eai-gofer-${{ steps.version.outputs.version }}.vsix"'
      );
      expect(RELEASE_WORKFLOW.slice(finalTreeCheckIndex, archiveIndex)).toContain(
        'git diff --exit-code'
      );
      expect(RELEASE_WORKFLOW.slice(finalTreeCheckIndex, archiveIndex)).toContain(
        'git diff --cached --exit-code'
      );
      expect(RELEASE_SCRIPT).toContain(
        'npm run gofer:surface-release:check -- --version "$NEW_VERSION" --candidate'
      );
      expect(RELEASE_WORKFLOW).toContain(
        "ref: ${{ github.event_name == 'push' && github.sha || steps.version.outputs.tag_name }}"
      );
      expect(RELEASE_WORKFLOW).toContain('checked_out_commit="$(git rev-parse HEAD)"');
      expect(RELEASE_WORKFLOW).toContain(
        "group: release-${{ github.event_name == 'workflow_dispatch' && inputs.version || github.ref_name }}"
      );
      expect(RELEASE_WORKFLOW).toContain('INPUT_VERSION: ${{ inputs.version }}');
      expect(RELEASE_WORKFLOW).not.toContain('raw_version="${{ inputs.version }}"');
      expect(RELEASE_WORKFLOW).toContain(
        'if ! [[ "$raw_version" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$ ]]'
      );
      expect(RELEASE_WORKFLOW).toContain('EVENT_SHA: ${{ github.sha }}');
      expect(RELEASE_WORKFLOW).toContain('tag_commit="$(git rev-parse "$RELEASE_TAG^{commit}")"');
      expect(RELEASE_WORKFLOW).toContain(
        'if ! git merge-base --is-ancestor "$tag_commit" origin/main; then'
      );
      expect(RELEASE_WORKFLOW).toContain('Re-verify Release Tag Immediately Before Publish');
    });

    it('should make Marketplace publication monotonic and exactly retryable', () => {
      expect(RELEASE_WORKFLOW).toContain('name: Check VS Code Marketplace Version');
      expect(RELEASE_WORKFLOW).toContain(
        'comparison="$(node scripts/compare-release-versions.mjs "$marketplace_version" "$TARGET_VERSION")"'
      );
      expect(RELEASE_WORKFLOW).toContain('already_published=true');
      expect(RELEASE_WORKFLOW).toContain('already_published=false');
      expect(RELEASE_WORKFLOW).toContain('refusing downgrade');
      expect(RELEASE_WORKFLOW).toContain("if: needs.validate.outputs.prerelease != 'true'");
      expect(RELEASE_WORKFLOW).toContain(
        'Marketplace already contained the exact release version; no publish was attempted.'
      );
      expect(RELEASE_WORKFLOW).toContain('node scripts/verify-marketplace-metadata.mjs');
      expect(RELEASE_WORKFLOW).toContain('scripts/verify-marketplace-vsix.sh');
      const marketplacePreflightIndex = RELEASE_WORKFLOW.indexOf(
        'name: Check VS Code Marketplace Version'
      );
      const githubPublishIndex = RELEASE_WORKFLOW.indexOf(
        'name: Publish GitHub Release',
        marketplacePreflightIndex
      );
      expect(githubPublishIndex).toBeGreaterThan(marketplacePreflightIndex);
      const marketplacePublishIndex = RELEASE_WORKFLOW.indexOf(
        'name: Publish VS Code Marketplace Extension'
      );
      const marketplaceVerifyIndex = RELEASE_WORKFLOW.indexOf(
        'name: Verify Published Marketplace Bytes'
      );
      expect(marketplaceVerifyIndex).toBeGreaterThan(marketplacePublishIndex);
      expect(RELEASE_SCRIPT).toContain('node scripts/verify-marketplace-metadata.mjs');
      expect(RELEASE_SCRIPT).toContain('MARKETPLACE_VSIX_ATTEMPTS=1');
    });

    it('should make release archives reproducible and exact-retry all three GitHub assets', () => {
      expect(RELEASE_WORKFLOW).toContain('scripts/create-release-archive.sh');
      expect(RELEASE_WORKFLOW).toContain('gofer-$RELEASE_TAG.tar.gz');
      expect(RELEASE_WORKFLOW).toContain('--pattern "gofer-$RELEASE_TAG.tar.gz"');
      expect(RELEASE_WORKFLOW).toContain(
        'JSON.stringify(actualAssets) !== JSON.stringify(expectedAssets)'
      );
      expect(RELEASE_WORKFLOW.match(/cmp --silent/g)?.length).toBeGreaterThanOrEqual(4);
      expect(RELEASE_WORKFLOW).toContain('name: Verify Published GitHub Release Assets');
    });

    it('should enforce historical artifact immutability in CI, Pages, and immediately before release commit', () => {
      expect(CI_WORKFLOW).toContain('name: Protect Historical Public Release Artifacts');
      expect(CI_WORKFLOW).toContain('fetch-depth: 0');
      expect(PAGES_WORKFLOW).toContain('name: Protect Historical Public Release Artifacts');
      expect(PAGES_WORKFLOW).toContain('fetch-depth: 0');
      for (const action of [...PAGES_WORKFLOW.matchAll(/^\s*uses:\s*([^\s]+)$/gm)].map(
        (match) => match[1]
      )) {
        expect(action).toMatch(/@[0-9a-f]{40}$/);
      }
      expect(RELEASE_WORKFLOW).toContain('name: Classify First Publication or Exact Retry');
      expect(RELEASE_WORKFLOW).toContain('confirmed_retry=true');
      expect(RELEASE_WORKFLOW).toContain('--strict-prior');
      const publisherIndex = RELEASE_SCRIPT.indexOf(
        'node scripts/publish-public-release-assets.mjs "$NEW_VERSION"'
      );
      const finalHistoryIndex = RELEASE_SCRIPT.indexOf(
        '"Final historical public release artifact immutability"',
        publisherIndex
      );
      const branchIndex = RELEASE_SCRIPT.indexOf('git checkout -b "$RELEASE_BRANCH"');
      expect(finalHistoryIndex).toBeGreaterThan(publisherIndex);
      expect(branchIndex).toBeGreaterThan(finalHistoryIndex);
    });

    it('should budget enough time for Marketplace propagation verification', () => {
      const marketplaceStart = RELEASE_WORKFLOW.indexOf('  publish_marketplace:');
      const marketplaceBlock = RELEASE_WORKFLOW.slice(marketplaceStart);
      expect(marketplaceBlock).toContain('timeout-minutes: 30');
      expect(marketplaceBlock).toContain('for attempt in {1..60}; do');
      expect(marketplaceBlock).toContain('sleep 20');
    });

    it('should bound Pages requests within the GitHub publish job timeout', () => {
      const githubStart = RELEASE_WORKFLOW.indexOf('  publish_github:');
      const marketplaceStart = RELEASE_WORKFLOW.indexOf('  publish_marketplace:');
      const githubBlock = RELEASE_WORKFLOW.slice(githubStart, marketplaceStart);
      expect(githubBlock).toContain('timeout-minutes: 60');
      expect(githubBlock).toContain('for attempt in {1..30}; do');
      expect(githubBlock).toContain('curl -fsSL --connect-timeout 2 --max-time 5');
      expect(githubBlock).toContain('if [ "$attempt" -lt 30 ]; then sleep 10; fi');
    });

    it('should derive prerelease state from the tag and verify existing release metadata', () => {
      expect(RELEASE_WORKFLOW).toContain('if [[ "$version" == *-* ]]');
      expect(RELEASE_WORKFLOW).toContain('derived_prerelease=true');
      expect(RELEASE_WORKFLOW).toContain('[ "$INPUT_PRERELEASE" != "$derived_prerelease" ]');
      expect(RELEASE_WORKFLOW).toContain('echo "prerelease=$derived_prerelease"');
      expect(RELEASE_WORKFLOW).toContain('RELEASE_PRERELEASE:');
      expect(RELEASE_WORKFLOW).toContain('release.draft !== false');
      expect(RELEASE_WORKFLOW).toContain('release.prerelease !== expectedPrerelease');
      expect(RELEASE_WORKFLOW).toContain(
        'Existing GitHub release metadata or exact asset-name set does not match the request.'
      );
    });
  });
});
