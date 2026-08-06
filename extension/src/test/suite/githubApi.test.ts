import * as assert from 'assert';
import { GitHubApiClient } from '../../utils/githubApi.js';
import type { ReleaseInfo } from '../../utils/githubApi.js';

type GitHubApiClientTestHarness = {
  makeRequest: (endpoint: string) => Promise<Record<string, unknown>>;
  getLatestRelease: () => Promise<ReleaseInfo>;
};

suite('GitHubApiClient release normalization', () => {
  test('maps snake_case GitHub release fields into ReleaseInfo', async () => {
    const client = GitHubApiClient.getInstance() as unknown as GitHubApiClientTestHarness;
    const originalMakeRequest = client.makeRequest;

    client.makeRequest = async () => ({
      id: 123,
      tag_name: 'v9.9.9',
      name: 'Gofer v9.9.9',
      body: 'Release notes',
      published_at: '2026-06-18T00:00:00Z',
      zipball_url: 'https://api.github.com/repos/eai-support/eai-gofer/zipball/v9.9.9',
      tarball_url: 'https://api.github.com/repos/eai-support/eai-gofer/tarball/v9.9.9',
      prerelease: false,
      draft: false,
      assets: [
        {
          id: 456,
          name: 'eai-gofer-agent-plugin-9.9.9.zip',
          content_type: 'application/zip',
          size: 42,
          download_count: 7,
          browser_download_url:
            'https://github.com/eai-support/eai-gofer/releases/download/v9.9.9/eai-gofer-agent-plugin-9.9.9.zip',
          updated_at: '2026-06-18T00:00:00Z',
        },
      ],
    });

    try {
      const release = await client.getLatestRelease();
      assert.strictEqual(release.version, 'v9.9.9');
      assert.strictEqual(
        release.downloadUrl,
        'https://api.github.com/repos/eai-support/eai-gofer/zipball/v9.9.9'
      );
      assert.strictEqual(release.isPrerelease, false);
      assert.strictEqual(release.description, 'Release notes');
      assert.strictEqual(release.published.toISOString(), '2026-06-18T00:00:00.000Z');
    } finally {
      client.makeRequest = originalMakeRequest;
    }
  });

  test('rejects untrusted release download URLs before fetch', async () => {
    const client = GitHubApiClient.getInstance();

    await assert.rejects(
      () => client.downloadRelease('https://example.com/gofer.zip'),
      /Untrusted release download URL/
    );
  });
});
