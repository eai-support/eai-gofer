import * as vscode from 'vscode';
import * as https from 'https';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from './services/Logger';

const execFileAsync = promisify(execFile);
const RELEASES_HOST = 'eai-support.github.io';
const RELEASES_PATH_PREFIX = '/eai-gofer/releases/';
const GITHUB_RELEASES_HOST = 'github.com';
const GITHUB_RELEASES_PATH_PREFIX = '/eai-support/eai-gofer/releases/download/';
const GITHUB_ASSET_HOSTS = new Set([
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
const VSIX_FILE_PATTERN = /^(?:eai-gofer|gofer)-\d+\.\d+\.\d+\.vsix$/;

interface ReleaseRecord {
  version: string;
  download_url?: string;
}

interface ReleaseIndex {
  latest_version?: string;
  releases?: ReleaseRecord[];
}

/**
 * Auto-updater for extensions distributed via GitHub Releases
 */
export class AutoUpdater {
  private githubRepo: string;
  private currentVersion: string;
  private checkInterval: number = 24 * 60 * 60 * 1000; // 24 hours
  private extensionName: string;
  private intervalId: NodeJS.Timeout | null = null;
  private logger?: Logger;

  constructor(
    githubRepo: string,
    currentVersion: string,
    extensionName: string = 'eai-gofer',
    logger?: Logger
  ) {
    this.githubRepo = githubRepo; // e.g., "eai-support/eai-gofer"
    this.currentVersion = currentVersion;
    this.extensionName = extensionName;
    this.logger = logger;
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks(context: vscode.ExtensionContext): void {
    // Check on startup
    this.checkForUpdates(context);

    // Check every 24 hours and store interval ID for cleanup
    this.intervalId = setInterval(() => {
      this.checkForUpdates(context);
    }, this.checkInterval);

    // Register disposal to prevent memory leaks
    context.subscriptions.push({
      dispose: () => {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      },
    });
  }

  /**
   * Check for updates from GitHub Releases
   */
  async checkForUpdates(_context: vscode.ExtensionContext): Promise<void> {
    try {
      const latestVersion = await this.getLatestVersion();

      if (this.isNewerVersion(latestVersion, this.currentVersion)) {
        await this.promptUpdate(latestVersion);
      }
    } catch (_error) {
      console.error('Update check failed');
      // Don't show error popups for automatic checks to avoid spamming users
      // Only show errors for manual checks
    }
  }

  /**
   * Get latest version from GitHub Pages JSON API
   * This works even for private repositories since GitHub Pages can be public
   */
  private async getLatestVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'eai-support.github.io',
        path: '/eai-gofer/releases.json',
        headers: {
          userAgent: 'VSCode-Extension-Updater',
          accept: 'application/json',
        },
      };

      https
        .get(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              // Log the response for debugging

              if (res.statusCode === 404) {
                reject(
                  new Error(
                    `Release page not found. GitHub Pages may not be set up yet for ${this.githubRepo}.`
                  )
                );
                return;
              } else if (res.statusCode !== 200) {
                reject(new Error(`GitHub Pages returned status ${res.statusCode}: ${data}`));
                return;
              }

              const releaseData = JSON.parse(data);
              if (!releaseData || !releaseData.latest_version) {
                reject(
                  new Error(
                    `Invalid release data received from GitHub Pages. Received: ${JSON.stringify(releaseData).substring(0, 200)}`
                  )
                );
                return;
              }

              resolve(releaseData.latest_version);
            } catch (error) {
              reject(error);
            }
          });
        })
        .on('error', reject);
    });
  }

  /**
   * Compare version strings
   */
  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (latestParts[i] > currentParts[i]) {
        return true;
      }
      if (latestParts[i] < currentParts[i]) {
        return false;
      }
    }

    return false;
  }

  /**
   * Download file from URL
   */
  private downloadFile(url: string, destPath: string, redirectDepth = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.assertAllowedDownloadUrl(url, redirectDepth > 0);
      } catch (error) {
        reject(error);
        return;
      }

      https
        .get(url, { headers: { userAgent: 'VSCode-Extension-Updater' } }, (response) => {
          // Follow redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              if (redirectDepth >= 3) {
                reject(new Error('Too many redirects while downloading update'));
                return;
              }

              const nextUrl = new URL(redirectUrl, url).toString();
              try {
                this.assertAllowedDownloadUrl(nextUrl, true);
              } catch (error) {
                reject(error);
                return;
              }

              this.downloadFile(nextUrl, destPath, redirectDepth + 1)
                .then(resolve)
                .catch(reject);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
            return;
          }

          const file = fsSync.createWriteStream(destPath);
          response.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fsSync.unlink(destPath, () => {});
          reject(err);
        });
    });
  }

  /**
   * Get download URL for VSIX file from GitHub Pages release data
   */
  private async getDownloadUrl(version: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'eai-support.github.io',
        path: '/eai-gofer/releases.json',
        headers: {
          userAgent: 'VSCode-Extension-Updater',
          accept: 'application/json',
        },
      };

      https
        .get(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const releaseData = JSON.parse(data) as ReleaseIndex;

              // Find the specific version in releases array
              const release = releaseData.releases?.find((r) => r.version === version);

              if (release && release.download_url) {
                this.assertAllowedDownloadUrl(release.download_url, false);
                resolve(release.download_url);
              } else {
                reject(new Error(`No download URL found for version ${version}`));
              }
            } catch (error) {
              reject(error);
            }
          });
        })
        .on('error', reject);
    });
  }

  private assertAllowedDownloadUrl(rawUrl: string, allowGitHubAssetRedirect: boolean): void {
    if (!this.isAllowedDownloadUrl(rawUrl, allowGitHubAssetRedirect)) {
      throw new Error(`Refusing to download update from untrusted URL: ${rawUrl}`);
    }
  }

  private isAllowedDownloadUrl(rawUrl: string, allowGitHubAssetRedirect = false): boolean {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }

    if (parsed.protocol !== 'https:') {
      return false;
    }

    const fileName = path.posix.basename(parsed.pathname);
    if (!VSIX_FILE_PATTERN.test(fileName)) {
      return false;
    }

    if (parsed.hostname === RELEASES_HOST) {
      return parsed.pathname.startsWith(RELEASES_PATH_PREFIX);
    }

    if (parsed.hostname === GITHUB_RELEASES_HOST) {
      return parsed.pathname.startsWith(GITHUB_RELEASES_PATH_PREFIX);
    }

    return allowGitHubAssetRedirect && GITHUB_ASSET_HOSTS.has(parsed.hostname);
  }

  /**
   * Install VSIX file using VSCode Extension API
   */
  private async installVsix(vsixPath: string): Promise<void> {
    try {
      // Check if the VSIX file exists
      await fs.access(vsixPath);

      // Use VS Code's built-in extension installation
      const vsixUri = vscode.Uri.file(vsixPath);
      await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
    } catch (installError) {
      // Fallback: Try the CLI approach with better error handling

      try {
        // Try to find the code command in common locations
        const possibleCodePaths = [
          'code',
          '/usr/local/bin/code',
          '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
          process.platform === 'win32' ? 'code.cmd' : 'code',
        ];

        let codeCommand = null;
        for (const codePath of possibleCodePaths) {
          try {
            const locator = process.platform === 'win32' ? 'where' : 'which';
            await execFileAsync(locator, [codePath]);
            codeCommand = codePath;
            break;
          } catch {
            // Continue to next path
          }
        }

        if (!codeCommand) {
          throw new Error(
            'VS Code CLI command not found. Please install VS Code CLI or restart VS Code to complete the update.',
            { cause: installError }
          );
        }

        // Install the extension using CLI
        const { stderr } = await execFileAsync(codeCommand, [
          '--install-extension',
          vsixPath,
          '--force',
        ]);

        if (
          stderr &&
          !stderr.includes('successfully installed') &&
          !stderr.includes('Extension') &&
          !stderr.includes('installed')
        ) {
          throw new Error(stderr, { cause: installError });
        }
      } catch (cliError) {
        // If both methods fail, provide clear instructions
        const errorMsg = cliError instanceof Error ? cliError.message : String(cliError);

        if (errorMsg.includes('command not found') || errorMsg.includes('not found')) {
          throw new Error(
            `Cannot auto-install update. Please install manually:

1. Download: https://eai-support.github.io/eai-gofer/releases/eai-gofer-${this.getCurrentVersionFromPath(vsixPath)}.vsix
2. Open VS Code Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file

Or install VS Code CLI: https://code.visualstudio.com/docs/editor/command-line`,
            { cause: cliError }
          );
        } else {
          throw new Error(`Failed to install extension: ${errorMsg}`, { cause: cliError });
        }
      }
    }
  }

  /**
   * Extract version from VSIX path for error messages
   */
  private getCurrentVersionFromPath(vsixPath: string): string {
    const match = vsixPath.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'latest';
  }

  /**
   * Prompt user to update with automatic installation
   */
  private async promptUpdate(newVersion: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `🎉 Gofer v${newVersion} is available! (Current: v${this.currentVersion})`,
      'Install Update',
      'View Release Notes',
      'Later'
    );

    if (choice === 'Install Update') {
      await this.downloadAndInstall(newVersion);
    } else if (choice === 'View Release Notes') {
      const url = `https://github.com/${this.githubRepo}/releases/latest`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }

  /**
   * Download and install the update
   */
  private async downloadAndInstall(version: string): Promise<void> {
    const statusBarItem = vscode.window.setStatusBarMessage('$(sync~spin) Downloading update...');

    try {
      // Get download URL
      const downloadUrl = await this.getDownloadUrl(version);

      // Create temp directory
      const tempDir = os.tmpdir();
      const vsixFileName = `${this.extensionName}-${version}.vsix`;
      const vsixPath = path.join(tempDir, vsixFileName);

      // Download VSIX
      vscode.window.setStatusBarMessage('$(sync~spin) Downloading update...');
      await this.downloadFile(downloadUrl, vsixPath);

      // Install VSIX
      vscode.window.setStatusBarMessage('$(sync~spin) Installing update...');
      await this.installVsix(vsixPath);

      // Clean up
      await fs.unlink(vsixPath).catch((err) =>
        this.logger?.error('AutoUpdater:CleanupVsix', err as Error, {
          operation: 'cleanup',
          vsixPath,
        })
      );

      statusBarItem.dispose();

      // Auto-reload after successful installation with countdown
      // Use withProgress for a more visible notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `✅ Gofer v${version} installed!`,
          cancellable: true,
        },
        async (progress, token) => {
          return new Promise<void>((resolve) => {
            let secondsRemaining = 5;

            const updateProgress = (): void => {
              progress.report({
                message: `Reloading VS Code in ${secondsRemaining}s... (Click Cancel to postpone)`,
                increment: 20,
              });
            };

            updateProgress();

            const interval = setInterval(() => {
              if (token.isCancellationRequested) {
                clearInterval(interval);
                vscode.window.showInformationMessage(
                  `Gofer v${version} is installed. Reload VS Code manually when ready.`
                );
                resolve();
                return;
              }

              secondsRemaining--;
              if (secondsRemaining <= 0) {
                clearInterval(interval);
                vscode.commands.executeCommand('workbench.action.reloadWindow');
                resolve();
              } else {
                updateProgress();
              }
            }, 1000);
          });
        }
      );
    } catch (error) {
      statusBarItem.dispose();

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a CLI installation issue
      if (
        errorMessage.includes('command not found') ||
        errorMessage.includes('Cannot auto-install')
      ) {
        const manualChoice = await vscode.window.showWarningMessage(
          `⚠️ Auto-update requires manual installation\n\nReason: ${errorMessage.split('\n')[0]}`,
          'Download & Install Manually',
          'Install VS Code CLI',
          'Dismiss'
        );

        if (manualChoice === 'Download & Install Manually') {
          // Open the GitHub Pages release page directly
          vscode.env.openExternal(vscode.Uri.parse('https://eai-support.github.io/eai-gofer/'));

          // Show installation instructions
          vscode.window.showInformationMessage(
            `📦 Manual Installation Steps:

1. Download the .vsix file from the opened page
2. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)  
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file
5. Reload VS Code when prompted`,
            'Got it'
          );
        } else if (manualChoice === 'Install VS Code CLI') {
          vscode.env.openExternal(
            vscode.Uri.parse('https://code.visualstudio.com/docs/editor/command-line')
          );
        }
      } else {
        // Other errors - show generic fallback
        const fallbackChoice = await vscode.window.showErrorMessage(
          `Failed to auto-update: ${errorMessage}`,
          'Download Manually',
          'Dismiss'
        );

        if (fallbackChoice === 'Download Manually') {
          vscode.env.openExternal(vscode.Uri.parse('https://eai-support.github.io/eai-gofer/'));
        }
      }
    }
  }

  /**
   * Manual update check command
   */
  async manualCheck(): Promise<void> {
    const statusBarItem = vscode.window.setStatusBarMessage('$(sync~spin) Checking for updates...');

    try {
      const latestVersion = await this.getLatestVersion();

      if (this.isNewerVersion(latestVersion, this.currentVersion)) {
        await this.promptUpdate(latestVersion);
      } else {
        vscode.window.showInformationMessage(
          `✅ You're on the latest version (v${this.currentVersion})`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        vscode.window
          .showInformationMessage(
            `GitHub Pages release site not found.\n\nCurrent version: v${this.currentVersion}\n\nPlease check that GitHub Pages is enabled for the repository.\n\nSite URL: https://eai-support.github.io/eai-gofer`,
            'Open Release Site',
            'OK'
          )
          .then((choice) => {
            if (choice === 'Open Release Site') {
              vscode.env.openExternal(vscode.Uri.parse('https://eai-support.github.io/eai-gofer'));
            }
          });
      } else if (errorMessage.includes('rate limit')) {
        vscode.window.showWarningMessage(
          `⏳ Too many requests.\n\nCurrent version: v${this.currentVersion}\n\nPlease try again later.`,
          'OK'
        );
      } else {
        vscode.window.showErrorMessage(`Failed to check for updates: ${errorMessage}`);
      }
    } finally {
      statusBarItem.dispose();
    }
  }
}
