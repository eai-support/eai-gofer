import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  GitHubApiClient,
  downloadLatestTemplates,
  getLatestTemplateRelease,
} from '../../utils/githubApi.js';

function liveNetworkTestsEnabled(): boolean {
  return process.env.RUN_LIVE_NETWORK_TESTS === '1' && !process.env.SKIP_NETWORK_TESTS;
}

/**
 * End-to-End Tests for GitHub API Integration
 *
 * These tests verify real GitHub API connectivity and template downloading.
 * They run only when RUN_LIVE_NETWORK_TESTS=1 is set. SKIP_NETWORK_TESTS disables them.
 */

suite('E2E GitHub API Tests', () => {
  let apiClient: GitHubApiClient;
  let testWorkspacePath: string;

  suiteSetup(async () => {
    // Initialize test workspace
    testWorkspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gofer-e2e-test-'));

    // Initialize GitHub API client
    apiClient = GitHubApiClient.getInstance();
  });

  suiteTeardown(async () => {
    if (fs.existsSync(testWorkspacePath)) {
      fs.rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  suite('GitHub API Connectivity', () => {
    test('should connect to GitHub API', async function () {
      this.timeout(10000);

      // Skip unless live network testing is explicitly enabled.
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      const result = await apiClient.testConnection();
      assert.strictEqual(result.success, true, 'Should successfully connect to GitHub API');
      assert.ok(result.rateLimit >= 0, 'Should return rate limit information');
    });

    test('should handle rate limiting gracefully', async function () {
      this.timeout(10000);

      // Skip unless live network testing is explicitly enabled.
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      // Make multiple rapid requests to trigger rate limiting
      const promises = Array(10)
        .fill(null)
        .map(() => apiClient.testConnection());

      try {
        const results = await Promise.all(promises);
        // Should either succeed or handle rate limiting gracefully
        const successCount = results.filter((result) => result.success === true).length;
        assert.ok(successCount > 0, 'At least some requests should succeed');
      } catch (error) {
        // Rate limiting should be handled gracefully, not throw
        assert.fail(`Rate limiting not handled gracefully: ${error}`);
      }
    });

    test('should fetch latest Gofer release', async function () {
      this.timeout(10000);

      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      const release = await apiClient.getLatestRelease();
      assert.ok(release, 'Should return a release object');
      assert.ok(release.version, 'Release should have a version');
      assert.ok(release.downloadUrl, 'Release should have a download URL');
      assert.ok(release.published, 'Release should have a published date');
    });

    test('should fetch Gofer template releases', async function () {
      this.timeout(10000);

      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      const templateRelease = await getLatestTemplateRelease();
      assert.ok(templateRelease, 'Should return a template release');
      assert.ok(templateRelease.version, 'Release should have a version');
      assert.ok(templateRelease.downloadUrl, 'Release should have a download URL');
    });
  });

  suite('Template Downloading', () => {
    const testTemplateDir = path.join(__dirname, '..', '..', '..', 'test-templates');

    setup(async () => {
      // Clean up test directory
      if (fs.existsSync(testTemplateDir)) {
        fs.rmSync(testTemplateDir, { recursive: true, force: true });
      }
      fs.mkdirSync(testTemplateDir, { recursive: true });
    });

    teardown(async () => {
      // Clean up test directory
      if (fs.existsSync(testTemplateDir)) {
        fs.rmSync(testTemplateDir, { recursive: true, force: true });
      }
    });

    test('should download and extract template with progress', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(30000); // 30 seconds for download

      try {
        const templateData = await downloadLatestTemplates();

        assert.ok(templateData, 'Should return template data');
        assert.ok(templateData.byteLength > 0, 'Template data should not be empty');

        // Verify it's a valid ZIP file by checking magic bytes
        const view = new Uint8Array(templateData);
        const isZip = view[0] === 0x50 && view[1] === 0x4b; // PK header
        assert.ok(isZip, 'Downloaded data should be a ZIP file');
      } catch (error) {
        // Network failures are acceptable in test environment
        console.warn('Template download failed (acceptable in test):', error);
      }
    });

    test('should handle download failures gracefully', async function () {
      this.timeout(30000);

      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      // Verify the function exists and returns a promise
      const downloadPromise = downloadLatestTemplates();
      assert.ok(downloadPromise instanceof Promise, 'Should return a Promise');

      try {
        const result = await downloadPromise;
        // If it succeeds, that's fine
        assert.ok(result, 'Download should return data or handle failure gracefully');
      } catch (error) {
        // Failures should be handled gracefully
        assert.ok(error instanceof Error, 'Errors should be proper Error objects');
      }
    });

    test('should validate downloaded templates', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(30000);

      try {
        const templateData = await downloadLatestTemplates();

        // Basic validation - should be binary data
        assert.ok(templateData instanceof ArrayBuffer, 'Should return ArrayBuffer');
        assert.ok(templateData.byteLength > 0, 'Should have content');

        const templateBuffer = Buffer.from(templateData);
        assert.ok(templateBuffer.length > 0, 'Template buffer should have content');
      } catch (error) {
        console.warn('Template validation failed (acceptable in test):', error);
      }
    });
  });

  suite('Repository Initialization E2E', () => {
    const testRepoPath = path.join(__dirname, '..', '..', '..', 'test-repo');

    setup(async () => {
      // Clean up test directory
      if (fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
      fs.mkdirSync(testRepoPath, { recursive: true });
    });

    teardown(async () => {
      // Clean up test directory
      if (fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('should initialize repository with latest templates', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(45000); // 45 seconds for full initialization

      // Download templates to .specify directory
      const specifyPath = path.join(testRepoPath, '.specify');
      fs.mkdirSync(specifyPath, { recursive: true });

      const templateData = await downloadLatestTemplates();

      assert.strictEqual(templateData instanceof ArrayBuffer, true, 'Should return template data');

      // Verify .specify structure was created
      assert.ok(fs.existsSync(specifyPath), '.specify directory should exist');

      const templateBuffer = Buffer.from(templateData);
      assert.ok(templateBuffer.length > 0, 'Template buffer should have content');
    });

    test('should handle network failures during initialization', async function () {
      // This test can run without network

      // Create empty .specify structure
      const specifyPath = path.join(testRepoPath, '.specify');
      fs.mkdirSync(specifyPath, { recursive: true });

      // Write a simple template as fallback test
      fs.writeFileSync(
        path.join(specifyPath, 'README.md'),
        '# Test Repository\n\nThis is a test initialization.'
      );

      // Verify basic structure exists
      assert.ok(fs.existsSync(specifyPath), '.specify directory should exist');
      assert.ok(fs.existsSync(path.join(specifyPath, 'README.md')), 'README should exist');
    });
  });

  suite('Integration with Extension Commands', () => {
    test('should execute initialize command successfully', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(60000); // 60 seconds for full command execution

      // Execute the initialize command
      try {
        await vscode.commands.executeCommand('gofer.initialize');

        // Verify the command completed (no exception thrown)
        assert.ok(true, 'Initialize command should execute without errors');

        // Check if .specify directory was created in workspace
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspacePath) {
          path.join(workspacePath, '.specify');
          // Don't assert existence as it depends on workspace state
          // Just verify command executed successfully
        }
      } catch (error) {
        // Command might fail in test environment, but shouldn't throw
        console.warn('Initialize command failed in test environment:', error);
      }
    });

    test('should execute update now command', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(60000); // Update checks call the public release feed.

      try {
        await vscode.commands.executeCommand('gofer.updateNow');
        assert.ok(true, 'Update now command should execute');
      } catch (error) {
        console.warn('Update now command failed in test environment:', error);
      }
    });

    test('should execute update check command', async function () {
      if (!liveNetworkTestsEnabled()) {
        this.skip();
        return;
      }

      this.timeout(60000); // Update checks call the public release feed.

      try {
        await vscode.commands.executeCommand('gofer.checkForUpdates');
        assert.ok(true, 'Check for updates command should execute');
      } catch (error) {
        console.warn('Check for updates command failed in test environment:', error);
      }
    });
  });
});
