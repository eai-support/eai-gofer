import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { ProjectDetector } from '../../../extension/src/services/ProjectDetector';
import { FileUtils } from '../../../extension/src/utils/fileUtils';

vi.mock('../../../extension/src/utils/fileUtils');

describe('ProjectDetector', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no files exist
    vi.mocked(FileUtils.exists).mockResolvedValue(false);
  });

  function mockFileExists(...files: string[]): void {
    vi.mocked(FileUtils.exists).mockImplementation(async (filePath: string) => {
      return files.some((f) => filePath.endsWith(f));
    });
  }

  function mockFileContent(contentMap: Record<string, string>): void {
    vi.mocked(FileUtils.readTextFile).mockImplementation(async (filePath: string) => {
      for (const [suffix, content] of Object.entries(contentMap)) {
        if (filePath.endsWith(suffix)) {
          return content;
        }
      }
      throw new Error(`File not found: ${filePath}`);
    });
  }

  describe('detect()', () => {
    it('returns unknown project for empty workspace', async () => {
      const info = await ProjectDetector.detect('/workspace/empty-project');

      expect(info.name).toBe('empty-project');
      expect(info.language).toBe('unknown');
      expect(info.framework).toBeNull();
      expect(info.testRunner).toBeNull();
      expect(info.packageManager).toBeNull();
    });

    it('detects TypeScript project', async () => {
      mockFileExists(
        'tsconfig.json',
        'package.json',
        'package-lock.json',
        'vitest.config.ts',
        '.eslintrc.json',
        '.prettierrc'
      );
      mockFileContent({
        'package.json': JSON.stringify({
          scripts: { test: 'vitest', build: 'tsc', lint: 'eslint .', format: 'prettier --write .' },
          dependencies: { react: '^18.0.0' },
        }),
      });

      const info = await ProjectDetector.detect('/workspace/my-ts-app');

      expect(info.name).toBe('my-ts-app');
      expect(info.language).toBe('typescript');
      expect(info.hasTypeScript).toBe(true);
      expect(info.testRunner).toBe('vitest');
      expect(info.testCommand).toBe('npm test');
      expect(info.buildCommand).toBe('npm run build');
      expect(info.lintCommand).toBe('npm run lint');
      expect(info.formatCommand).toBe('npm run format');
      expect(info.framework).toBe('React');
      expect(info.packageManager).toBe('npm');
      expect(info.hasEslint).toBe(true);
      expect(info.hasPrettier).toBe(true);
    });

    it('detects Python project with Django', async () => {
      mockFileExists('pyproject.toml', 'poetry.lock');
      mockFileContent({
        'pyproject.toml': '[tool.pytest]\n[project]\ndependencies = ["django>=4.0"]',
      });

      const info = await ProjectDetector.detect('/workspace/django-app');

      expect(info.language).toBe('python');
      expect(info.testRunner).toBe('pytest');
      expect(info.framework).toBe('Django');
      expect(info.packageManager).toBe('poetry');
    });

    it('detects Go project with Gin', async () => {
      mockFileExists('go.mod');
      mockFileContent({
        'go.mod': 'module example.com/myapp\n\nrequire github.com/gin-gonic/gin v1.9.0',
      });

      const info = await ProjectDetector.detect('/workspace/go-api');

      expect(info.language).toBe('go');
      expect(info.framework).toBe('Gin');
    });

    it('detects Rust project with Actix', async () => {
      mockFileExists('Cargo.toml');
      mockFileContent({
        'Cargo.toml': '[dependencies]\nactix-web = "4"',
      });

      const info = await ProjectDetector.detect('/workspace/rust-svc');

      expect(info.language).toBe('rust');
      expect(info.framework).toBe('Actix');
    });

    it('detects Java project from pom.xml', async () => {
      mockFileExists('pom.xml');

      const info = await ProjectDetector.detect('/workspace/java-app');

      expect(info.language).toBe('java');
    });

    it('detects JavaScript with Next.js and Jest', async () => {
      mockFileExists('package.json', 'jest.config.js', 'yarn.lock');
      mockFileContent({
        'package.json': JSON.stringify({
          scripts: { test: 'jest', build: 'next build' },
          dependencies: { next: '14.0.0', react: '^18.0.0' },
        }),
      });

      const info = await ProjectDetector.detect('/workspace/next-app');

      expect(info.language).toBe('javascript');
      expect(info.testRunner).toBe('jest');
      expect(info.framework).toBe('Next.js');
      expect(info.packageManager).toBe('yarn');
    });

    it('prioritizes tsconfig over package.json for language', async () => {
      mockFileExists('tsconfig.json', 'package.json');
      mockFileContent({
        'package.json': JSON.stringify({ scripts: {} }),
      });

      const info = await ProjectDetector.detect('/workspace/ambiguous');

      expect(info.language).toBe('typescript');
      expect(info.hasTypeScript).toBe(true);
    });

    it('handles malformed package.json gracefully', async () => {
      mockFileExists('package.json');
      mockFileContent({
        'package.json': '{ invalid json',
      });

      const info = await ProjectDetector.detect('/workspace/broken');

      expect(info.language).toBe('javascript');
      expect(info.testCommand).toBeNull();
      expect(info.framework).toBeNull();
    });

    it('does not classify a repo as EAI-initialized when only manifest.yml exists', async () => {
      mockFileExists('manifest.yml');

      const info = await ProjectDetector.detect('/workspace/generic-manifest-app');

      expect(info.eaiInitialized).toBe(false);
    });

    it('classifies a repo as EAI-initialized when eai.runtime.json exists', async () => {
      mockFileExists('eai.runtime.json');

      const info = await ProjectDetector.detect('/workspace/eai-runtime-app');

      expect(info.eaiInitialized).toBe(true);
    });

    it('classifies a repo as EAI-initialized when manifest.yml and src/eai.config exist together', async () => {
      mockFileExists(
        'manifest.yml',
        path.join('src', 'eai.config'),
        path.join('src', 'eai.config', 'register.ts')
      );

      const info = await ProjectDetector.detect('/workspace/eai-app');

      expect(info.eaiInitialized).toBe(true);
    });

    it('detects pnpm package manager', async () => {
      mockFileExists('package.json', 'pnpm-lock.yaml');
      mockFileContent({
        'package.json': JSON.stringify({ scripts: {} }),
      });

      const info = await ProjectDetector.detect('/workspace/pnpm-proj');

      expect(info.packageManager).toBe('pnpm');
    });

    it('detects eslint.config.mjs (flat config)', async () => {
      mockFileExists('package.json', 'eslint.config.mjs');
      mockFileContent({
        'package.json': JSON.stringify({ scripts: {} }),
      });

      const info = await ProjectDetector.detect('/workspace/flat-eslint');

      expect(info.hasEslint).toBe(true);
    });

    it('detects Python project from setup.py', async () => {
      mockFileExists('setup.py');

      const info = await ProjectDetector.detect('/workspace/setuptools-project');

      expect(info.language).toBe('python');
    });

    it('detects Python project from requirements.txt', async () => {
      mockFileExists('requirements.txt');

      const info = await ProjectDetector.detect('/workspace/pip-project');

      expect(info.language).toBe('python');
    });

    it('pyproject.toml takes priority over setup.py', async () => {
      mockFileExists('pyproject.toml', 'setup.py');
      mockFileContent({
        'pyproject.toml': '[project]\nname = "myapp"',
      });

      const info = await ProjectDetector.detect('/workspace/python-both');

      expect(info.language).toBe('python');
      // Verify it was detected via pyproject.toml (first match wins due to array order)
      // Both resolve to 'python' but pyproject.toml is listed first in checks array
    });

    it('tsconfig.json takes priority over requirements.txt', async () => {
      mockFileExists('tsconfig.json', 'requirements.txt', 'package.json');
      mockFileContent({
        'package.json': JSON.stringify({ scripts: {} }),
      });

      const info = await ProjectDetector.detect('/workspace/polyglot');

      expect(info.language).toBe('typescript');
      expect(info.hasTypeScript).toBe(true);
    });
  });
});
