import { readFileSync } from 'fs';
import * as path from 'path';
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
        'run_release_check "Gofer unit test suite" npm run test:unit'
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

    it('should gate releases on origin/main ancestry and fast-forward local main safely', () => {
      expect(RELEASE_SCRIPT).toContain('git merge-base --is-ancestor origin/main HEAD');
      expect(RELEASE_SCRIPT).toContain('git pull --ff-only origin main');
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

      expect(updateReleasesIndex).toBeGreaterThan(validationGateIndex);
      expect(publishAssetsIndex).toBeGreaterThan(updateReleasesIndex);
    });

    it('should validate merged main before pushing the release tag', () => {
      const publishModeIndex = RELEASE_SCRIPT.indexOf('if [ "$RELEASE_PHASE" = "publish" ]; then');
      const publishGateIndex = RELEASE_SCRIPT.indexOf(
        'run_release_validation_gate "$CURRENT_VERSION"',
        publishModeIndex
      );
      const pushTagIndex = RELEASE_SCRIPT.indexOf(
        'git push --no-verify origin "$TAG_NAME"',
        publishModeIndex
      );

      expect(publishGateIndex).toBeGreaterThan(publishModeIndex);
      expect(pushTagIndex).toBeGreaterThan(publishGateIndex);
    });

    it('should stage the full release diff before creating the release commit', () => {
      const gitAddIndex = RELEASE_SCRIPT.indexOf('git add -A');
      const releaseCommitIndex = RELEASE_SCRIPT.indexOf(
        'git commit --no-verify -m "release: v$NEW_VERSION'
      );

      expect(gitAddIndex).toBeGreaterThan(-1);
      expect(releaseCommitIndex).toBeGreaterThan(gitAddIndex);
      expect(RELEASE_SCRIPT).not.toContain(
        'git add package.json package-lock.json extension/package.json extension/package-lock.json'
      );
    });

    it('should attach the agent plugin zip to the GitHub release alongside the VSIX', () => {
      expect(RELEASE_SCRIPT).toContain('./eai-gofer-$NEW_VERSION.vsix');
      expect(RELEASE_SCRIPT).toContain('./dist/eai-gofer-agent-plugin-$NEW_VERSION.zip');
    });

    it('should verify the public Gemini manifest alongside Claude and Codex', () => {
      expect(RELEASE_SCRIPT).toContain(
        'GEMINI_EXTENSION_URL="https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gemini-extension.json"'
      );
      expect(RELEASE_SCRIPT).toContain('REMOTE_GEMINI_URL=');
      expect(RELEASE_SCRIPT).toContain('Gemini extension URL is correct');
    });

    it('should keep GitHub release workflow aligned with the local release gate', () => {
      expect(RELEASE_WORKFLOW).toContain('Checkout EAI App Template');
      expect(RELEASE_WORKFLOW).toContain('npm --prefix eai-app-template ci');
      expect(RELEASE_WORKFLOW).toContain('npm run gofer:generate:check');
      expect(RELEASE_WORKFLOW).toContain(
        'npm run gofer:surface-release:check -- --version "${{ steps.version.outputs.version }}"'
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
    });
  });
});
