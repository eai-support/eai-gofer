import { Logger } from './logger';
import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '../config';

/**
 * GitHub API client for fetching releases and downloading templates
 * Handles authentication, rate limiting, and error recovery
 */

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  assets: GitHubAsset[];
  zipballUrl: string;
  tarballUrl: string;
  prerelease: boolean;
  draft: boolean;
}

export interface GitHubAsset {
  id: number;
  name: string;
  contentType: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
  updatedAt: string;
}

export interface ReleaseInfo {
  version: string;
  published: Date;
  description: string;
  downloadUrl: string;
  isPrerelease: boolean;
}

interface GitHubReleaseApiResponse {
  id?: number;
  tag_name?: string;
  tagName?: string;
  name?: string;
  body?: string;
  published_at?: string;
  publishedAt?: string;
  assets?: GitHubAssetApiResponse[];
  zipball_url?: string;
  zipballUrl?: string;
  tarball_url?: string;
  tarballUrl?: string;
  prerelease?: boolean;
  draft?: boolean;
}

interface GitHubAssetApiResponse {
  id?: number;
  name?: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  download_count?: number;
  downloadCount?: number;
  browser_download_url?: string;
  browserDownloadUrl?: string;
  updated_at?: string;
  updatedAt?: string;
}

interface GitHubRepositoryInfo {
  description: string;
  name: string;
  stargazers_count: number;
  updated_at: string;
}

interface GitHubApiError extends Error {
  status?: number;
}

const TRUSTED_RELEASE_PROTOCOLS = new Set(['https:', 'data:']);
const TRUSTED_RELEASE_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
]);

function normalizeGitHubAsset(asset: GitHubAssetApiResponse): GitHubAsset {
  return {
    id: asset.id ?? 0,
    name: asset.name ?? '',
    contentType: asset.contentType ?? asset.content_type ?? 'application/octet-stream',
    size: asset.size ?? 0,
    downloadCount: asset.downloadCount ?? asset.download_count ?? 0,
    browserDownloadUrl: asset.browserDownloadUrl ?? asset.browser_download_url ?? '',
    updatedAt: asset.updatedAt ?? asset.updated_at ?? '',
  };
}

function normalizeGitHubRelease(release: GitHubReleaseApiResponse): GitHubRelease {
  return {
    id: release.id ?? 0,
    tagName: release.tagName ?? release.tag_name ?? '',
    name: release.name ?? '',
    body: release.body ?? '',
    publishedAt: release.publishedAt ?? release.published_at ?? '',
    assets: (release.assets ?? []).map(normalizeGitHubAsset),
    zipballUrl: release.zipballUrl ?? release.zipball_url ?? '',
    tarballUrl: release.tarballUrl ?? release.tarball_url ?? '',
    prerelease: release.prerelease ?? false,
    draft: release.draft ?? false,
  };
}

function assertTrustedDownloadUrl(downloadUrl: string): void {
  if (downloadUrl.startsWith('data:')) {
    return;
  }

  const parsed = new URL(downloadUrl);
  if (
    !TRUSTED_RELEASE_PROTOCOLS.has(parsed.protocol) ||
    !TRUSTED_RELEASE_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(`Untrusted release download URL: ${downloadUrl}`);
  }
}

/**
 * GitHub API client with rate limiting and error handling
 */
export class GitHubApiClient {
  private static instance: GitHubApiClient;
  private logger = Logger.for('GitHubAPI');
  private baseUrl: string;
  private rateLimitRemaining = 60; // GitHub allows 60 requests/hour for unauthenticated
  private rateLimitReset = 0;
  private lastRequestTime = 0;

  private constructor() {
    this.baseUrl = GITHUB_API_BASE;
  }

  public static getInstance(): GitHubApiClient {
    if (!GitHubApiClient.instance) {
      GitHubApiClient.instance = new GitHubApiClient();
    }
    return GitHubApiClient.instance;
  }

  /**
   * Check rate limit and delay if necessary
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // If we're rate limited, wait until reset
    if (this.rateLimitRemaining <= 1 && now < this.rateLimitReset) {
      const waitTime = this.rateLimitReset - now;
      this.logger.warn(`Rate limited, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Minimum delay between requests (1 second)
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < 1000) {
      const delay = 1000 - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Make a GitHub API request with rate limiting and error handling
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    await this.checkRateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    this.lastRequestTime = Date.now();

    try {
      this.logger.debug(`Making GitHub API request: ${endpoint}`);
      
      const response = await fetch(url, {
        headers: {
          accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Gofer-VSCode-Extension/1.3.4',
        },
      });

      // Update rate limit info from headers
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const reset = response.headers.get('X-RateLimit-Reset');
      
      if (remaining) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      
      if (reset) {
        this.rateLimitReset = parseInt(reset, 10) * 1000; // Convert to milliseconds
      }

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`GitHub API rate limit exceeded. Reset at ${new Date(this.rateLimitReset)}`);
        } else if (response.status === 404) {
          throw new Error(`404: GitHub API endpoint not found: ${endpoint}`);
        } else {
          throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json() as T;
      this.logger.debug(`GitHub API request successful: ${endpoint}`, { 
        rateLimitRemaining: this.rateLimitRemaining 
      });
      
      return data;
    } catch (error) {
      this.logger.error(`GitHub API request failed: ${endpoint}`, error as Error);
      throw error;
    }
  }

  /**
   * Get the latest release for the templates repository
   */
  public async getLatestRelease(): Promise<ReleaseInfo> {
    try {
      const rawRelease = await this.makeRequest<GitHubReleaseApiResponse>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
      );
      const release = normalizeGitHubRelease(rawRelease);
      
      return {
        version: release.tagName,
        published: new Date(release.publishedAt),
        description: release.body,
        downloadUrl: release.zipballUrl,
        isPrerelease: release.prerelease,
      };
    } catch (error) {
      const apiError = error as GitHubApiError;
      if (apiError.status === 404 || apiError.message.includes('404')) {
        this.logger.warn('Repository or release not found. Using fallback release.', apiError);
        return {
          version: 'v1.0.0',
          published: new Date(),
          description: 'Local fallback templates',
          downloadUrl: 'data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
          isPrerelease: false
        };
      }
      this.logger.error('Failed to get latest release', error as Error);
      throw error;
    }
  }

  /**
   * Get all releases (paginated)
   */
  public async getAllReleases(page: number = 1, perPage: number = 30): Promise<ReleaseInfo[]> {
    try {
      const releases = await this.makeRequest<GitHubReleaseApiResponse[]>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?page=${page}&per_page=${perPage}`
      );
      
      return releases.map(rawRelease => {
        const release = normalizeGitHubRelease(rawRelease);
        return {
        version: release.tagName,
        published: new Date(release.publishedAt),
        description: release.body,
        downloadUrl: release.zipballUrl,
        isPrerelease: release.prerelease,
        };
      });
    } catch (error) {
      this.logger.error('Failed to get all releases', error as Error);
      throw error;
    }
  }

  /**
   * Get a specific release by tag name
   */
  public async getRelease(tagName: string): Promise<ReleaseInfo> {
    try {
      const rawRelease = await this.makeRequest<GitHubReleaseApiResponse>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tagName}`
      );
      const release = normalizeGitHubRelease(rawRelease);
      
      return {
        version: release.tagName,
        published: new Date(release.publishedAt),
        description: release.body,
        downloadUrl: release.zipballUrl,
        isPrerelease: release.prerelease,
      };
    } catch (error) {
      this.logger.error(`Failed to get release: ${tagName}`, error as Error);
      throw error;
    }
  }

  /**
   * Download a release archive (ZIP)
   */
  public async downloadRelease(downloadUrl: string): Promise<ArrayBuffer> {
    try {
      assertTrustedDownloadUrl(downloadUrl);
      this.logger.info(`Downloading release archive from: ${downloadUrl}`);
      
      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Gofer-VSCode-Extension/1.3.4',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download release: ${response.status} ${response.statusText}`);
      }

      assertTrustedDownloadUrl(response.url || downloadUrl);

      const arrayBuffer = await response.arrayBuffer();
      this.logger.info(`Downloaded release archive: ${arrayBuffer.byteLength} bytes`);
      
      return arrayBuffer;
    } catch (error) {
      this.logger.error('Failed to download release archive', error as Error);
      throw error;
    }
  }

  /**
   * Check if a newer version is available
   */
  public async checkForUpdates(currentVersion: string): Promise<{ hasUpdate: boolean; latestVersion?: string; releaseInfo?: ReleaseInfo }> {
    try {
      const latest = await this.getLatestRelease();
      
      // Simple version comparison (assumes semantic versioning)
      const hasUpdate = this.compareVersions(currentVersion, latest.version) < 0;
      
      return {
        hasUpdate,
        latestVersion: latest.version,
        releaseInfo: latest,
      };
    } catch (error) {
      this.logger.error('Failed to check for updates', error as Error);
      return { hasUpdate: false };
    }
  }

  /**
   * Simple semantic version comparison
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const normalize = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    
    const parts1 = normalize(v1);
    const parts2 = normalize(v2);
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) {
        return -1;
      }
      if (part1 > part2) {
        return 1;
      }
    }
    
    return 0;
  }

  /**
   * Get repository information
   */
  public async getRepositoryInfo(): Promise<{ name: string; description: string; stars: number; lastUpdated: Date }> {
    try {
      const repo = await this.makeRequest<GitHubRepositoryInfo>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`
      );
      
      return {
        name: repo.name,
        description: repo.description,
        stars: repo.stargazers_count,
        lastUpdated: new Date(repo.updated_at),
      };
    } catch (error) {
      this.logger.error('Failed to get repository info', error as Error);
      throw error;
    }
  }

  /**
   * Test connectivity to GitHub API
   */
  public async testConnection(): Promise<{ success: boolean; rateLimit: number; error?: string }> {
    try {
      await this.makeRequest<Record<string, unknown>>('/rate_limit');
      
      return {
        success: true,
        rateLimit: this.rateLimitRemaining,
      };
    } catch (error) {
      return {
        success: false,
        rateLimit: this.rateLimitRemaining,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get rate limit status
   */
  public getRateLimitStatus(): { remaining: number; resetTime: Date } {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: new Date(this.rateLimitReset),
    };
  }
}

/**
 * Convenience functions for common operations
 */

/**
 * Get the latest template release
 */
export async function getLatestTemplateRelease(): Promise<ReleaseInfo> {
  const client = GitHubApiClient.getInstance();
  return await client.getLatestRelease();
}

/**
 * Download the latest templates
 */
export async function downloadLatestTemplates(): Promise<ArrayBuffer> {
  const client = GitHubApiClient.getInstance();
  const latest = await client.getLatestRelease();
  return await client.downloadRelease(latest.downloadUrl);
}

/**
 * Check if template updates are available
 */
export async function checkForTemplateUpdates(currentVersion: string): Promise<{ hasUpdate: boolean; latestVersion?: string }> {
  const client = GitHubApiClient.getInstance();
  const result = await client.checkForUpdates(currentVersion);
  
  return {
    hasUpdate: result.hasUpdate,
    latestVersion: result.latestVersion,
  };
}

/**
 * Test GitHub API connectivity
 */
export async function testGitHubConnection(): Promise<boolean> {
  const client = GitHubApiClient.getInstance();
  const result = await client.testConnection();
  return result.success;
}
