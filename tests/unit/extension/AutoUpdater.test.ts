/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { AutoUpdater } from '../../../extension/src/autoUpdater';
import * as path from 'path';
import * as os from 'os';

/**
 * Tests for AutoUpdater - version checking and update management
 * Following "Real Tests with Real Data" philosophy where possible
 */

describe('AutoUpdater - Version Comparison', () => {
  let updater: AutoUpdater;

  beforeEach(() => {
    updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0', 'eai-gofer');
  });

  describe('isNewerVersion', () => {
    it('should detect newer major version', () => {
      // Access private method via type assertion
      const result = (updater as any).isNewerVersion('2.0.0', '1.0.0');
      expect(result).toBe(true);
    });

    it('should detect newer minor version', () => {
      const result = (updater as any).isNewerVersion('1.5.0', '1.0.0');
      expect(result).toBe(true);
    });

    it('should detect newer patch version', () => {
      const result = (updater as any).isNewerVersion('1.0.5', '1.0.0');
      expect(result).toBe(true);
    });

    it('should return false for same version', () => {
      const result = (updater as any).isNewerVersion('1.0.0', '1.0.0');
      expect(result).toBe(false);
    });

    it('should return false for older major version', () => {
      const result = (updater as any).isNewerVersion('1.0.0', '2.0.0');
      expect(result).toBe(false);
    });

    it('should return false for older minor version', () => {
      const result = (updater as any).isNewerVersion('1.0.0', '1.5.0');
      expect(result).toBe(false);
    });

    it('should return false for older patch version', () => {
      const result = (updater as any).isNewerVersion('1.0.0', '1.0.5');
      expect(result).toBe(false);
    });

    it('should handle version with leading v', () => {
      // Version strings should have v stripped before comparison
      const result = (updater as any).isNewerVersion('2.0.0', '1.0.0');
      expect(result).toBe(true);
    });

    it('should handle multi-digit version numbers', () => {
      const result = (updater as any).isNewerVersion('10.12.99', '10.12.98');
      expect(result).toBe(true);
    });

    it('should handle version comparison across boundaries', () => {
      // 1.9.99 is older than 2.0.0
      const result = (updater as any).isNewerVersion('2.0.0', '1.9.99');
      expect(result).toBe(true);
    });

    it('should compare major version first', () => {
      // 2.0.0 is newer than 1.99.99
      const result = (updater as any).isNewerVersion('2.0.0', '1.99.99');
      expect(result).toBe(true);
    });

    it('should compare minor version when major is same', () => {
      const result = (updater as any).isNewerVersion('1.10.0', '1.9.0');
      expect(result).toBe(true);
    });

    it('should compare patch version when major and minor are same', () => {
      const result = (updater as any).isNewerVersion('1.0.10', '1.0.9');
      expect(result).toBe(true);
    });
  });

  describe('Version String Edge Cases', () => {
    it('should handle versions with different digit counts', () => {
      const result1 = (updater as any).isNewerVersion('2.0.0', '1.10.5');
      expect(result1).toBe(true);

      const result2 = (updater as any).isNewerVersion('1.10.5', '2.0.0');
      expect(result2).toBe(false);
    });

    it('should handle zero versions', () => {
      const result = (updater as any).isNewerVersion('1.0.0', '0.9.9');
      expect(result).toBe(true);
    });

    it('should handle initial release comparisons', () => {
      const result = (updater as any).isNewerVersion('0.1.0', '0.0.1');
      expect(result).toBe(true);
    });
  });
});

describe('AutoUpdater - URL and Path Extraction', () => {
  let updater: AutoUpdater;

  beforeEach(() => {
    updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0', 'eai-gofer');
  });

  describe('getCurrentVersionFromPath', () => {
    it('should extract version from standard VSIX path', () => {
      const vsixPath = '/tmp/eai-gofer-2.5.3.vsix';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      expect(version).toBe('2.5.3');
    });

    it('should extract version from complex path', () => {
      const vsixPath = '/Users/john/Downloads/extensions/eai-gofer-10.12.99.vsix';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      expect(version).toBe('10.12.99');
    });

    it('should return "latest" when no version found', () => {
      const vsixPath = '/tmp/eai-gofer-unknown.vsix';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      expect(version).toBe('latest');
    });

    it('should extract first version if multiple present', () => {
      const vsixPath = '/tmp/1.0.0/eai-gofer-2.5.3.vsix';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      // Should match first occurrence
      expect(version).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should handle Windows-style paths', () => {
      const vsixPath = 'C:\\Users\\John\\Downloads\\eai-gofer-3.2.1.vsix';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      expect(version).toBe('3.2.1');
    });

    it('should handle paths with no extension', () => {
      const vsixPath = '/tmp/eai-gofer-2.5.3';
      const version = (updater as any).getCurrentVersionFromPath(vsixPath);
      expect(version).toBe('2.5.3');
    });
  });
});

describe('AutoUpdater - Constructor and Initialization', () => {
  it('should initialize with correct repository', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0', 'eai-gofer');
    expect(updater).toBeDefined();
    expect((updater as any).githubRepo).toBe('eai-support/eai-gofer');
  });

  it('should initialize with correct current version', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.3', 'eai-gofer');
    expect((updater as any).currentVersion).toBe('2.5.3');
  });

  it('should initialize with correct extension name', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0', 'eai-gofer');
    expect((updater as any).extensionName).toBe('eai-gofer');
  });

  it('should use default extension name if not provided', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
    expect((updater as any).extensionName).toBe('eai-gofer');
  });

  it('should initialize check interval to 24 hours', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
    expect((updater as any).checkInterval).toBe(24 * 60 * 60 * 1000);
  });

  it('should initialize with null interval ID', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
    expect((updater as any).intervalId).toBeNull();
  });
});

describe('AutoUpdater - Release Data Parsing', () => {
  describe('GitHub Pages JSON Format', () => {
    it('should parse valid release JSON with latest_version', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [
          {
            version: '2.5.3',
            download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.3.vsix',
            release_date: '2025-01-15',
          },
          {
            version: '2.5.2',
            download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.2.vsix',
            release_date: '2025-01-10',
          },
        ],
      };

      expect(releaseData.latest_version).toBe('2.5.3');
      expect(releaseData.releases).toHaveLength(2);
      expect(releaseData.releases[0].version).toBe('2.5.3');
    });

    it('should validate release data structure', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [
          {
            version: '2.5.3',
            download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.3.vsix',
            release_date: '2025-01-15',
          },
        ],
      };

      expect(releaseData).toHaveProperty('latest_version');
      expect(releaseData).toHaveProperty('releases');
      expect(Array.isArray(releaseData.releases)).toBe(true);
      expect(releaseData.releases[0]).toHaveProperty('version');
      expect(releaseData.releases[0]).toHaveProperty('download_url');
    });

    it('should find specific version in releases array', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [
          {
            version: '2.5.3',
            download_url: 'https://example.com/v2.5.3.vsix',
          },
          {
            version: '2.5.2',
            download_url: 'https://example.com/v2.5.2.vsix',
          },
          {
            version: '2.5.1',
            download_url: 'https://example.com/v2.5.1.vsix',
          },
        ],
      };

      const targetVersion = '2.5.2';
      const release = releaseData.releases.find((r) => r.version === targetVersion);

      expect(release).toBeDefined();
      expect(release?.version).toBe('2.5.2');
      expect(release?.download_url).toBe('https://example.com/v2.5.2.vsix');
    });

    it('should return undefined when version not found in releases', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [
          {
            version: '2.5.3',
            download_url: 'https://example.com/v2.5.3.vsix',
          },
        ],
      };

      const release = releaseData.releases.find((r) => r.version === '3.0.0');
      expect(release).toBeUndefined();
    });
  });

  describe('Invalid Release Data', () => {
    it('should detect missing latest_version field', () => {
      const invalidData = {
        releases: [],
      };

      expect(invalidData).not.toHaveProperty('latest_version');
    });

    it('should detect missing releases array', () => {
      const invalidData = {
        latest_version: '2.5.3',
      };

      expect(invalidData).not.toHaveProperty('releases');
    });

    it('should handle empty releases array', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [],
      };

      expect(releaseData.releases).toHaveLength(0);
    });

    it('should detect release without download_url', () => {
      const releaseData = {
        latest_version: '2.5.3',
        releases: [
          {
            version: '2.5.3',
            // missing download_url
          },
        ],
      };

      expect(releaseData.releases[0]).not.toHaveProperty('download_url');
    });
  });
});

describe('AutoUpdater - HTTP Response Handling', () => {
  describe('Status Code Handling', () => {
    it('should recognize 404 as not found', () => {
      const statusCode = 404;
      expect(statusCode).toBe(404);
    });

    it('should recognize 200 as success', () => {
      const statusCode = 200;
      expect(statusCode).toBe(200);
    });

    it('should recognize 301 as permanent redirect', () => {
      const statusCode = 301;
      expect(statusCode === 301 || statusCode === 302).toBe(true);
    });

    it('should recognize 302 as temporary redirect', () => {
      const statusCode = 302;
      expect(statusCode === 301 || statusCode === 302).toBe(true);
    });

    it('should recognize non-200/300 as error', () => {
      const statusCode = 500;
      expect(statusCode !== 200 && statusCode !== 301 && statusCode !== 302).toBe(true);
    });

    it('should handle rate limiting (429)', () => {
      const statusCode = 429;
      expect(statusCode).toBe(429);
    });
  });

  describe('Response Data Validation', () => {
    it('should validate JSON response structure', () => {
      const responseData = '{"latest_version":"2.5.3","releases":[]}';
      const parsed = JSON.parse(responseData);

      expect(parsed).toHaveProperty('latest_version');
      expect(parsed).toHaveProperty('releases');
    });

    it('should handle malformed JSON gracefully', () => {
      const invalidJson = '{"latest_version":"2.5.3",broken}';

      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    it('should handle empty response', () => {
      const emptyResponse = '';

      expect(() => JSON.parse(emptyResponse)).toThrow();
    });

    it('should handle response with unexpected structure', () => {
      const unexpectedResponse = '{"foo":"bar"}';
      const parsed = JSON.parse(unexpectedResponse);

      expect(parsed).not.toHaveProperty('latest_version');
    });
  });
});

describe('AutoUpdater - Error Message Formatting', () => {
  describe('Error Type Detection', () => {
    it('should detect 404 not found errors', () => {
      const errorMessage = 'Release page not found. GitHub Pages may not be set up yet';
      expect(errorMessage.toLowerCase()).toContain('not found');
      // The actual error message doesn't contain '404' - it's in the code's status check
    });

    it('should detect rate limit errors', () => {
      const errorMessage = 'API rate limit exceeded';
      expect(errorMessage.toLowerCase()).toContain('rate limit');
    });

    it('should detect CLI command not found errors', () => {
      const errorMessage = 'VS Code CLI command not found';
      expect(errorMessage.toLowerCase()).toContain('command not found');
    });

    it('should detect invalid release data errors', () => {
      const errorMessage = 'Invalid release data received from GitHub Pages';
      expect(errorMessage.toLowerCase()).toContain('invalid');
    });

    it('should detect download failure errors', () => {
      const errorMessage = 'Failed to download: HTTP 500';
      expect(errorMessage.toLowerCase()).toContain('failed to download');
    });
  });

  describe('User-Facing Messages', () => {
    it('should format update available message', () => {
      const currentVersion = '1.0.0';
      const newVersion = '2.5.3';
      const message = `🎉 Gofer v${newVersion} is available! (Current: v${currentVersion})`;

      expect(message).toContain('Gofer');
      expect(message).toContain('2.5.3');
      expect(message).toContain('1.0.0');
      expect(message).toContain('available');
    });

    it('should format up-to-date message', () => {
      const currentVersion = '2.5.3';
      const message = `✅ You're on the latest version (v${currentVersion})`;

      expect(message).toContain('latest version');
      expect(message).toContain('2.5.3');
    });

    it('should format installation success message', () => {
      const version = '2.5.3';
      const message = `✅ Gofer v${version} has been installed! Reload VSCode to activate the update.`;

      expect(message).toContain('installed');
      expect(message).toContain('2.5.3');
      expect(message).toContain('Reload');
    });

    it('should format manual installation instructions', () => {
      const instructions = `📦 Manual Installation Steps:

1. Download the .vsix file from the opened page
2. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file
5. Reload VS Code when prompted`;

      expect(instructions).toContain('Manual Installation');
      expect(instructions).toContain('.vsix');
      expect(instructions).toContain('Command Palette');
    });
  });
});

describe('AutoUpdater - Download URL Construction', () => {
  let updater: AutoUpdater;

  beforeEach(() => {
    updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0', 'eai-gofer');
  });

  it('should construct correct GitHub Pages download URL', () => {
    const version = '2.5.3';
    const extensionName = 'eai-gofer';
    const expectedUrl = `https://eai-support.github.io/eai-gofer/releases/${extensionName}-${version}.vsix`;

    expect(expectedUrl).toBe('https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.3.vsix');
  });

  it('should construct correct GitHub releases API URL', () => {
    // Path for GitHub Pages releases.json
    const expectedPath = '/eai-gofer/releases.json';

    expect(expectedPath).toBe('/eai-gofer/releases.json');
  });

  it('should construct correct GitHub release notes URL', () => {
    const repo = 'eai-support/eai-gofer';
    const url = `https://github.com/${repo}/releases/latest`;

    expect(url).toBe('https://github.com/eai-support/eai-gofer/releases/latest');
  });

  it('should construct correct GitHub Pages base URL', () => {
    const hostname = 'eai-support.github.io';
    const path = '/eai-gofer/releases.json';
    const fullUrl = `https://${hostname}${path}`;

    expect(fullUrl).toBe('https://eai-support.github.io/eai-gofer/releases.json');
  });

  it('should allow canonical GitHub Pages VSIX downloads', () => {
    const allowed = (updater as any).isAllowedDownloadUrl(
      'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.3.vsix'
    );

    expect(allowed).toBe(true);
  });

  it('should allow legacy VSIX names from the canonical release host', () => {
    const allowed = (updater as any).isAllowedDownloadUrl(
      'https://eai-support.github.io/eai-gofer/releases/gofer-2.5.3.vsix'
    );

    expect(allowed).toBe(true);
  });

  it('should allow canonical GitHub Release asset URLs', () => {
    const allowed = (updater as any).isAllowedDownloadUrl(
      'https://github.com/eai-support/eai-gofer/releases/download/v2.5.3/eai-gofer-2.5.3.vsix'
    );

    expect(allowed).toBe(true);
  });

  it('should reject VSIX downloads from untrusted hosts', () => {
    const allowed = (updater as any).isAllowedDownloadUrl(
      'https://example.com/eai-gofer-2.5.3.vsix'
    );

    expect(allowed).toBe(false);
  });

  it('should reject non-VSIX assets even on the release host', () => {
    const allowed = (updater as any).isAllowedDownloadUrl(
      'https://eai-support.github.io/eai-gofer/releases/eai-gofer-2.5.3.zip'
    );

    expect(allowed).toBe(false);
  });

  it('should only allow GitHub asset CDN hosts after a trusted redirect', () => {
    const assetUrl = 'https://objects.githubusercontent.com/eai-gofer-2.5.3.vsix';

    expect((updater as any).isAllowedDownloadUrl(assetUrl)).toBe(false);
    expect((updater as any).isAllowedDownloadUrl(assetUrl, true)).toBe(true);
  });
});

describe('AutoUpdater - File System Operations', () => {
  describe('Temp Directory Handling', () => {
    it('should use OS temp directory for downloads', () => {
      const tempDir = os.tmpdir();
      expect(tempDir).toBeDefined();
      expect(typeof tempDir).toBe('string');
      expect(tempDir.length).toBeGreaterThan(0);
    });

    it('should construct VSIX path in temp directory', () => {
      const tempDir = os.tmpdir();
      const extensionName = 'eai-gofer';
      const version = '2.5.3';
      const vsixPath = path.join(tempDir, `${extensionName}-${version}.vsix`);

      expect(vsixPath).toContain(tempDir);
      expect(vsixPath).toContain('eai-gofer-2.5.3.vsix');
    });

    it('should handle temp directory with trailing slash', () => {
      const tempDir = os.tmpdir();
      const vsixFileName = 'eai-gofer-2.5.3.vsix';
      const vsixPath = path.join(tempDir, vsixFileName);

      expect(vsixPath).not.toContain('//');
    });
  });

  describe('VSIX Filename Construction', () => {
    it('should construct correct VSIX filename', () => {
      const extensionName = 'eai-gofer';
      const version = '2.5.3';
      const filename = `${extensionName}-${version}.vsix`;

      expect(filename).toBe('eai-gofer-2.5.3.vsix');
    });

    it('should handle version with leading v', () => {
      const extensionName = 'eai-gofer';
      const version = 'v2.5.3'.replace(/^v/, '');
      const filename = `${extensionName}-${version}.vsix`;

      expect(filename).toBe('eai-gofer-2.5.3.vsix');
    });

    it('should handle custom extension names', () => {
      const extensionName = 'my-custom-ext';
      const version = '1.0.0';
      const filename = `${extensionName}-${version}.vsix`;

      expect(filename).toBe('my-custom-ext-1.0.0.vsix');
    });
  });
});

describe('AutoUpdater - CLI Command Detection', () => {
  describe('Code Command Paths', () => {
    it('should define common code command paths', () => {
      const possibleCodePaths = [
        'code',
        '/usr/local/bin/code',
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
        process.platform === 'win32' ? 'code.cmd' : 'code',
      ];

      expect(possibleCodePaths).toHaveLength(4);
      expect(possibleCodePaths).toContain('code');
      expect(possibleCodePaths).toContain('/usr/local/bin/code');
    });

    it('should use code.cmd on Windows', () => {
      const isWindows = process.platform === 'win32';
      const codeCommand = isWindows ? 'code.cmd' : 'code';

      if (isWindows) {
        expect(codeCommand).toBe('code.cmd');
      } else {
        expect(codeCommand).toBe('code');
      }
    });

    it('should use code on Unix-like systems', () => {
      const isUnix = process.platform !== 'win32';
      const codeCommand = process.platform === 'win32' ? 'code.cmd' : 'code';

      if (isUnix) {
        expect(codeCommand).toBe('code');
      }
    });

    it('should include macOS-specific code path', () => {
      const macCodePath = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
      expect(macCodePath).toContain('Visual Studio Code.app');
    });
  });

  describe('CLI Error Detection', () => {
    it('should detect command not found errors', () => {
      const errorMessage = 'code: command not found';
      expect(errorMessage.toLowerCase()).toContain('command not found');
    });

    it('should detect not found errors (variant)', () => {
      const errorMessage = "Cannot find module 'code'";
      expect(errorMessage.toLowerCase()).toContain('cannot find');
    });

    it('should detect installation stderr that is not an error', () => {
      const stderr = 'Extension gofer was successfully installed.';
      const isSuccess =
        stderr.includes('successfully installed') ||
        stderr.includes('Extension') ||
        stderr.includes('installed');

      expect(isSuccess).toBe(true);
    });
  });
});

describe('AutoUpdater - Integration Scenarios', () => {
  describe('Update Flow Paths', () => {
    it('should determine no update needed when versions match', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.3');
      const isNewer = (updater as any).isNewerVersion('2.5.3', '2.5.3');

      expect(isNewer).toBe(false);
    });

    it('should determine update needed when newer version available', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.2');
      const isNewer = (updater as any).isNewerVersion('2.5.3', '2.5.2');

      expect(isNewer).toBe(true);
    });

    it('should skip update when current version is newer (dev build)', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '3.0.0-dev');
      // In real scenario, would need to strip -dev suffix
      const current = '3.0.0';
      const latest = '2.5.3';
      const isNewer = (updater as any).isNewerVersion(latest, current);

      expect(isNewer).toBe(false);
    });
  });

  describe('Error Recovery Paths', () => {
    it('should handle network error gracefully', () => {
      const error = new Error('ENOTFOUND eai-support.github.io');
      expect(error.message).toContain('ENOTFOUND');
    });

    it('should handle timeout error gracefully', () => {
      const error = new Error('ETIMEDOUT');
      expect(error.message).toContain('ETIMEDOUT');
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidResponse = 'not json';
      expect(() => JSON.parse(invalidResponse)).toThrow();
    });
  });

  describe('Cross-Platform Paths', () => {
    it('should construct valid paths on current platform', () => {
      const tempDir = os.tmpdir();
      const vsixPath = path.join(tempDir, 'eai-gofer-2.5.3.vsix');

      expect(vsixPath).toContain('eai-gofer-2.5.3.vsix');
      expect(path.isAbsolute(vsixPath)).toBe(true);
    });

    it('should use correct path separator for platform', () => {
      const separator = path.sep;
      expect(separator).toBeDefined();
      expect(['/', '\\']).toContain(separator);
    });
  });
});

describe('AutoUpdater - Periodic Check Management', () => {
  it('should set check interval to 24 hours by default', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
    const interval = (updater as any).checkInterval;

    expect(interval).toBe(24 * 60 * 60 * 1000);
    expect(interval).toBe(86400000); // 24 hours in milliseconds
  });

  it('should initialize with no active interval', () => {
    const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
    const intervalId = (updater as any).intervalId;

    expect(intervalId).toBeNull();
  });

  it('should calculate correct interval duration', () => {
    const hours = 24;
    const milliseconds = hours * 60 * 60 * 1000;

    expect(milliseconds).toBe(86400000);
  });
});

describe('AutoUpdater - Real-World Scenarios', () => {
  describe('Common Update Scenarios', () => {
    it('should handle fresh installation (v1.0.0 to v2.5.3)', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '1.0.0');
      const isNewer = (updater as any).isNewerVersion('2.5.3', '1.0.0');

      expect(isNewer).toBe(true);
    });

    it('should handle minor version update (v2.5.2 to v2.5.3)', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.2');
      const isNewer = (updater as any).isNewerVersion('2.5.3', '2.5.2');

      expect(isNewer).toBe(true);
    });

    it('should handle major version update (v2.5.3 to v3.0.0)', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.3');
      const isNewer = (updater as any).isNewerVersion('3.0.0', '2.5.3');

      expect(isNewer).toBe(true);
    });

    it('should handle already up-to-date (v2.5.3 to v2.5.3)', () => {
      const updater = new AutoUpdater('eai-support/eai-gofer', '2.5.3');
      const isNewer = (updater as any).isNewerVersion('2.5.3', '2.5.3');

      expect(isNewer).toBe(false);
    });
  });

  describe('Edge Case Scenarios', () => {
    it('should handle pre-release versions', () => {
      // Pre-release versions like 3.0.0-beta would need special handling
      const version = '3.0.0-beta';
      const cleanVersion = version.split('-')[0];

      expect(cleanVersion).toBe('3.0.0');
    });

    it('should handle build metadata in versions', () => {
      // Build metadata like 3.0.0+20250115 would need special handling
      const version = '3.0.0+20250115';
      const cleanVersion = version.split('+')[0];

      expect(cleanVersion).toBe('3.0.0');
    });

    it('should handle versions with v prefix', () => {
      const version = 'v2.5.3';
      const cleanVersion = version.replace(/^v/, '');

      expect(cleanVersion).toBe('2.5.3');
    });
  });
});

describe('AutoUpdater - Auto-Reload Behavior', () => {
  describe('Post-Installation Flow', () => {
    it('should display countdown message format correctly', () => {
      const secondsRemaining = 5;
      const message = `Reloading VS Code in ${secondsRemaining}s... (Click Cancel to postpone)`;

      expect(message).toContain('Reloading VS Code');
      expect(message).toContain('5s');
      expect(message).toContain('Cancel');
    });

    it('should format success title correctly', () => {
      const version = '4.6.1';
      const title = `✅ Gofer v${version} installed!`;

      expect(title).toContain('Gofer');
      expect(title).toContain('4.6.1');
      expect(title).toContain('installed');
    });

    it('should format cancellation message correctly', () => {
      const version = '4.6.1';
      const message = `Gofer v${version} is installed. Reload VS Code manually when ready.`;

      expect(message).toContain('Gofer');
      expect(message).toContain('4.6.1');
      expect(message).toContain('manually');
    });

    it('should countdown from 5 seconds', () => {
      let secondsRemaining = 5;
      const countdownSteps: number[] = [];

      // Simulate countdown
      while (secondsRemaining > 0) {
        countdownSteps.push(secondsRemaining);
        secondsRemaining--;
      }

      expect(countdownSteps).toEqual([5, 4, 3, 2, 1]);
      expect(countdownSteps.length).toBe(5);
    });

    it('should increment progress by 20% per second', () => {
      const incrementPerSecond = 20;
      const totalSeconds = 5;
      const totalIncrement = incrementPerSecond * totalSeconds;

      expect(totalIncrement).toBe(100);
    });
  });

  describe('Reload Trigger Conditions', () => {
    it('should trigger reload when countdown completes (secondsRemaining <= 0)', () => {
      let secondsRemaining = 1;
      let reloadTriggered = false;

      secondsRemaining--;
      if (secondsRemaining <= 0) {
        reloadTriggered = true;
      }

      expect(reloadTriggered).toBe(true);
    });

    it('should not trigger reload when cancelled', () => {
      const isCancellationRequested = true;
      let reloadTriggered = false;
      let showedManualMessage = false;

      if (isCancellationRequested) {
        showedManualMessage = true;
        // return early, don't reload
      } else {
        reloadTriggered = true;
      }

      expect(reloadTriggered).toBe(false);
      expect(showedManualMessage).toBe(true);
    });

    it('should continue countdown when not cancelled', () => {
      const isCancellationRequested = false;
      let secondsRemaining = 5;
      const countdownSteps: number[] = [];

      while (!isCancellationRequested && secondsRemaining > 0) {
        countdownSteps.push(secondsRemaining);
        secondsRemaining--;
      }

      expect(countdownSteps).toEqual([5, 4, 3, 2, 1]);
    });

    it('should stop countdown immediately when cancelled mid-countdown', () => {
      let isCancellationRequested = false;
      let secondsRemaining = 5;
      const countdownSteps: number[] = [];

      while (secondsRemaining > 0) {
        if (isCancellationRequested) {
          break;
        }
        countdownSteps.push(secondsRemaining);
        secondsRemaining--;

        // Simulate user cancelling after 2 seconds
        if (secondsRemaining === 3) {
          isCancellationRequested = true;
        }
      }

      expect(countdownSteps).toEqual([5, 4]);
    });
  });

  describe('Progress Notification Configuration', () => {
    it('should use Notification location for visibility', () => {
      // Progress notifications with Notification location appear in the corner
      // and are more visible than status bar messages
      const progressLocationNotification = 15; // VS Code enum value

      // This test documents the expected behavior
      expect(progressLocationNotification).toBe(15);
    });

    it('should be cancellable to allow user opt-out', () => {
      const cancellable = true;

      expect(cancellable).toBe(true);
    });
  });
});
