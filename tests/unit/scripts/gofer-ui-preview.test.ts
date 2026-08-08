import { describe, expect, it, beforeAll } from 'vitest';

const moduleUrl = new URL('../../../.specify/scripts/node/gofer-ui-preview.mjs', import.meta.url);

describe('gofer-ui-preview helper', () => {
  let preview: {
    detectPackageManagerFromNames: (fileNames: string[]) => string;
    selectPreviewScript: (scripts: Record<string, string>) => string | null;
    selectBusinessScenarioScript: (scripts: Record<string, string>) => string | null;
    isBrowserScenarioCommand: (command: string) => boolean;
    validateBusinessScenarioManifest: (manifest: unknown) => {
      valid: boolean;
      errors: string[];
      scenarioCount: number;
    };
    buildPackageScriptCommand: (packageManager: string, scriptName: string | null) => string | null;
    buildCandidateUrls: (options?: {
      explicitUrl?: string | null;
      command?: string | null;
      ports?: number[];
    }) => string[];
    buildOpenBrowserCommand: (
      url: string,
      platform?: NodeJS.Platform
    ) => { command: string; args: string[] };
    buildReviewLogRow: (row: {
      time?: string;
      change?: string;
      command?: string;
      url?: string;
      browserTarget?: string;
      screenshotPath?: string | null;
      selfReview?: string;
      openIssues?: string;
    }) => string;
    sanitizePreviewUrl: (value: string) => string;
    UI_REVIEW_LOG_COLUMNS: string[];
    parseArgs: (argv: string[]) => {
      featureDir: string | null;
      command: string | null;
      url: string | null;
      open: string;
      screenshot: boolean;
      timeoutMs: number;
      scenarioTimeoutMs: number;
      scenarioCommand: string | null;
      scenarios: string;
      json: boolean;
      dryRun: boolean;
    };
    markdownCell: (value: unknown) => string;
  };

  beforeAll(async () => {
    preview = await import(moduleUrl.href);
  });

  it('detects the package manager from lock files', () => {
    expect(preview.detectPackageManagerFromNames(['pnpm-lock.yaml'])).toBe('pnpm');
    expect(preview.detectPackageManagerFromNames(['yarn.lock'])).toBe('yarn');
    expect(preview.detectPackageManagerFromNames(['bun.lock'])).toBe('bun');
    expect(preview.detectPackageManagerFromNames(['package-lock.json'])).toBe('npm');
    expect(preview.detectPackageManagerFromNames([])).toBe('npm');
  });

  it('selects the fastest likely preview script in priority order', () => {
    expect(
      preview.selectPreviewScript({
        start: 'vite --host 0.0.0.0',
        dev: 'vite --host 0.0.0.0',
      })
    ).toBe('dev');

    expect(
      preview.selectPreviewScript({
        storybook: 'storybook dev -p 6006',
      })
    ).toBe('storybook');

    expect(preview.selectPreviewScript({ test: 'vitest run' })).toBeNull();
  });

  it('selects executable browser business-scenario scripts in priority order', () => {
    expect(
      preview.selectBusinessScenarioScript({
        'test:playwright': 'playwright test',
        'test:business-scenarios': 'playwright test tests/business',
      })
    ).toBe('test:business-scenarios');
    expect(preview.selectBusinessScenarioScript({ test: 'vitest run' })).toBeNull();
    expect(preview.isBrowserScenarioCommand('playwright test')).toBe(true);
    expect(preview.isBrowserScenarioCommand('vitest run')).toBe(false);
  });

  it('requires traceable scenarios, screens, and executable test files in the manifest', () => {
    expect(
      preview.validateBusinessScenarioManifest({
        schemaVersion: '1.0',
        scenarios: [
          {
            id: 'BS-001',
            userStory: 'US-01',
            screens: ['Start', 'Review'],
            testFiles: ['tests/e2e/business.spec.ts'],
          },
        ],
      })
    ).toEqual({ valid: true, errors: [], scenarioCount: 1 });

    const invalid = preview.validateBusinessScenarioManifest({
      schemaVersion: '1.0',
      scenarios: [{ id: 'BS-001', userStory: 'US-01', screens: [], testFiles: [] }],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('screens');
    expect(invalid.errors.join(' ')).toContain('testFiles');
  });

  it('builds package-manager-specific script commands', () => {
    expect(preview.buildPackageScriptCommand('npm', 'dev')).toBe('npm run dev');
    expect(preview.buildPackageScriptCommand('pnpm', 'dev')).toBe('pnpm run dev');
    expect(preview.buildPackageScriptCommand('yarn', 'dev')).toBe('yarn dev');
    expect(preview.buildPackageScriptCommand('bun', 'dev')).toBe('bun run dev');
    expect(preview.buildPackageScriptCommand('npm', null)).toBeNull();
  });

  it('uses explicit URLs or infers likely local preview ports from commands', () => {
    expect(preview.buildCandidateUrls({ explicitUrl: 'http://localhost:4321' })).toEqual([
      'http://localhost:4321/',
    ]);

    expect(
      preview.buildCandidateUrls({
        command: 'PORT=9090 vite --host 0.0.0.0 --port 5174',
        ports: [3000],
      })
    ).toEqual(['http://localhost:9090', 'http://localhost:5174', 'http://localhost:3000']);
  });

  it('builds cross-platform browser open commands', () => {
    expect(preview.buildOpenBrowserCommand('http://localhost:3000', 'darwin')).toEqual({
      command: 'open',
      args: ['http://localhost:3000/'],
    });
    expect(preview.buildOpenBrowserCommand('http://localhost:3000', 'win32')).toEqual({
      command: 'explorer.exe',
      args: ['http://localhost:3000/'],
    });
    expect(preview.buildOpenBrowserCommand('http://localhost:3000', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['http://localhost:3000/'],
    });
  });

  it('only allows browser opening for local loopback preview URLs', () => {
    expect(preview.sanitizePreviewUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/');
    expect(preview.sanitizePreviewUrl('https://app.localhost:3000/path')).toBe(
      'https://app.localhost:3000/path'
    );
    expect(() => preview.sanitizePreviewUrl('https://example.com')).toThrow(/local loopback URL/);
    expect(() => preview.sanitizePreviewUrl('javascript:alert(1)')).toThrow(/http or https/);
  });

  it('parses CLI flags and escapes markdown table cells', () => {
    const args = preview.parseArgs([
      '--feature-dir',
      '.specify/specs/example',
      '--command',
      'npm run dev',
      '--no-open',
      '--no-screenshot',
      '--timeout-ms',
      '5000',
      '--scenario-command',
      'playwright test tests/business',
      '--require-scenarios',
      '--scenario-timeout-ms',
      '6000',
      '--json',
      '--dry-run',
    ]);

    expect(args.featureDir).toBe('.specify/specs/example');
    expect(args.command).toBe('npm run dev');
    expect(args.open).toBe('none');
    expect(args.screenshot).toBe(false);
    expect(args.timeoutMs).toBe(5000);
    expect(args.scenarioCommand).toBe('playwright test tests/business');
    expect(args.scenarios).toBe('required');
    expect(args.scenarioTimeoutMs).toBe(6000);
    expect(args.json).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(preview.markdownCell('one\\two|three\nfour')).toBe('one\\\\two\\|three<br>four');
  });

  it('writes review-log rows that match the 14-column template contract', () => {
    const row = preview.buildReviewLogRow({
      time: '2026-07-09T00:00:00.000Z',
      change: 'button polish',
      command: 'npm run dev',
      url: 'http://localhost:5173/',
      browserTarget: 'auto',
      screenshotPath: '.specify/specs/example/preview/ui-preview.png',
      selfReview: 'Looks correct.',
      openIssues: 'none',
    });

    expect(preview.UI_REVIEW_LOG_COLUMNS).toHaveLength(14);
    expect(row.split(' | ')).toHaveLength(preview.UI_REVIEW_LOG_COLUMNS.length);
    expect(row).toContain('button polish');
    expect(row).toContain('pending user feedback');
  });
});
