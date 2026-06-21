import * as path from 'path';
import { FileUtils } from '../utils/fileUtils';

/**
 * Detected project characteristics used for instruction file generation.
 */
export interface ProjectInfo {
  name: string;
  language: string; // 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'unknown'
  framework: string | null;
  testRunner: string | null;
  testCommand: string | null;
  buildCommand: string | null;
  lintCommand: string | null;
  formatCommand: string | null;
  packageManager: string | null;
  hasTypeScript: boolean;
  hasEslint: boolean;
  hasPrettier: boolean;
  eaiInitialized: boolean;
}

/**
 * Detects project characteristics by scanning workspace manifest and config files.
 * All detection is local and deterministic — no API keys or network access required.
 */
export class ProjectDetector {
  /**
   * Detect project characteristics from the workspace at the given path.
   */
  public static async detect(workspacePath: string): Promise<ProjectInfo> {
    const info: ProjectInfo = {
      name: path.basename(workspacePath),
      language: 'unknown',
      framework: null,
      testRunner: null,
      testCommand: null,
      buildCommand: null,
      lintCommand: null,
      formatCommand: null,
      packageManager: null,
      hasTypeScript: false,
      hasEslint: false,
      hasPrettier: false,
      eaiInitialized: false,
    };

    // Run all detection in parallel
    await Promise.all([
      ProjectDetector.detectLanguage(workspacePath, info),
      ProjectDetector.detectTestRunner(workspacePath, info),
      ProjectDetector.detectLinterFormatter(workspacePath, info),
      ProjectDetector.detectPackageManager(workspacePath, info),
      ProjectDetector.detectEaiInitialization(workspacePath, info),
    ]);

    // These depend on language detection results
    await Promise.all([
      ProjectDetector.detectCommands(workspacePath, info),
      ProjectDetector.detectFramework(workspacePath, info),
    ]);

    return info;
  }

  /**
   * T003: Detect primary language from manifest files.
   */
  private static async detectLanguage(workspacePath: string, info: ProjectInfo): Promise<void> {
    const checks: Array<{ file: string; language: string }> = [
      { file: 'tsconfig.json', language: 'typescript' },
      { file: 'pyproject.toml', language: 'python' },
      { file: 'setup.py', language: 'python' },
      { file: 'requirements.txt', language: 'python' },
      { file: 'go.mod', language: 'go' },
      { file: 'Cargo.toml', language: 'rust' },
      { file: 'pom.xml', language: 'java' },
      { file: 'build.gradle', language: 'java' },
      { file: 'package.json', language: 'javascript' },
    ];

    for (const { file, language } of checks) {
      if (await FileUtils.exists(path.join(workspacePath, file))) {
        info.language = language;
        if (language === 'typescript') {
          info.hasTypeScript = true;
        }
        return;
      }
    }
  }

  /**
   * T004: Detect test runner from config files.
   */
  private static async detectTestRunner(workspacePath: string, info: ProjectInfo): Promise<void> {
    const runners: Array<{ patterns: string[]; runner: string }> = [
      { patterns: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'], runner: 'vitest' },
      { patterns: ['jest.config.ts', 'jest.config.js', 'jest.config.mjs'], runner: 'jest' },
      { patterns: ['pytest.ini', 'pyproject.toml'], runner: 'pytest' },
    ];

    for (const { patterns, runner } of runners) {
      for (const pattern of patterns) {
        const filePath = path.join(workspacePath, pattern);
        if (await FileUtils.exists(filePath)) {
          // For pytest, verify pyproject.toml actually has pytest config
          if (runner === 'pytest' && pattern === 'pyproject.toml') {
            try {
              const content = await FileUtils.readTextFile(filePath);
              if (!content.includes('[tool.pytest') && !content.includes('pytest')) {
                continue;
              }
            } catch {
              continue;
            }
          }
          info.testRunner = runner;
          return;
        }
      }
    }
  }

  /**
   * T005: Detect linter/formatter from config files.
   */
  private static async detectLinterFormatter(
    workspacePath: string,
    info: ProjectInfo
  ): Promise<void> {
    // ESLint detection
    const eslintConfigs = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      '.eslintrc',
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.ts',
    ];
    for (const config of eslintConfigs) {
      if (await FileUtils.exists(path.join(workspacePath, config))) {
        info.hasEslint = true;
        break;
      }
    }

    // Prettier detection
    const prettierConfigs = [
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.cjs',
      '.prettierrc.json',
      '.prettierrc.yml',
      '.prettierrc.yaml',
      '.prettierrc.toml',
      'prettier.config.js',
      'prettier.config.mjs',
    ];
    for (const config of prettierConfigs) {
      if (await FileUtils.exists(path.join(workspacePath, config))) {
        info.hasPrettier = true;
        break;
      }
    }
  }

  /**
   * T006: Detect build/test/lint/format commands from package.json scripts.
   */
  private static async detectCommands(workspacePath: string, info: ProjectInfo): Promise<void> {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (!(await FileUtils.exists(pkgPath))) {
      return;
    }

    try {
      const content = await FileUtils.readTextFile(pkgPath);
      const pkg = JSON.parse(content);
      const scripts = pkg.scripts || {};

      if (scripts.test) {
        info.testCommand = `npm test`;
      }
      if (scripts.build) {
        info.buildCommand = `npm run build`;
      }
      if (scripts.lint) {
        info.lintCommand = `npm run lint`;
      }
      if (scripts.format) {
        info.formatCommand = `npm run format`;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  /**
   * T007: Detect framework from dependencies.
   */
  private static async detectFramework(workspacePath: string, info: ProjectInfo): Promise<void> {
    if (info.language === 'typescript' || info.language === 'javascript') {
      await ProjectDetector.detectJsFramework(workspacePath, info);
    } else if (info.language === 'python') {
      await ProjectDetector.detectPythonFramework(workspacePath, info);
    } else if (info.language === 'go') {
      await ProjectDetector.detectGoFramework(workspacePath, info);
    } else if (info.language === 'rust') {
      await ProjectDetector.detectRustFramework(workspacePath, info);
    }
  }

  private static async detectJsFramework(workspacePath: string, info: ProjectInfo): Promise<void> {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (!(await FileUtils.exists(pkgPath))) {
      return;
    }

    try {
      const content = await FileUtils.readTextFile(pkgPath);
      const pkg = JSON.parse(content);
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      const frameworks: Array<{ dep: string; name: string }> = [
        { dep: 'next', name: 'Next.js' },
        { dep: 'react', name: 'React' },
        { dep: 'vue', name: 'Vue' },
        { dep: 'express', name: 'Express' },
        { dep: '@angular/core', name: 'Angular' },
        { dep: 'svelte', name: 'Svelte' },
      ];

      for (const { dep, name } of frameworks) {
        if (allDeps[dep]) {
          info.framework = name;
          return;
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  private static async detectPythonFramework(
    workspacePath: string,
    info: ProjectInfo
  ): Promise<void> {
    const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
    const requirementsPath = path.join(workspacePath, 'requirements.txt');

    const files = [pyprojectPath, requirementsPath];
    for (const filePath of files) {
      if (!(await FileUtils.exists(filePath))) {
        continue;
      }
      try {
        const content = await FileUtils.readTextFile(filePath);
        if (content.includes('django') || content.includes('Django')) {
          info.framework = 'Django';
          return;
        }
        if (content.includes('flask') || content.includes('Flask')) {
          info.framework = 'Flask';
          return;
        }
        if (content.includes('fastapi') || content.includes('FastAPI')) {
          info.framework = 'FastAPI';
          return;
        }
      } catch {
        continue;
      }
    }
  }

  private static async detectGoFramework(workspacePath: string, info: ProjectInfo): Promise<void> {
    const goModPath = path.join(workspacePath, 'go.mod');
    if (!(await FileUtils.exists(goModPath))) {
      return;
    }
    try {
      const content = await FileUtils.readTextFile(goModPath);
      if (content.includes('github.com/gin-gonic/gin')) {
        info.framework = 'Gin';
      } else if (content.includes('github.com/gofiber/fiber')) {
        info.framework = 'Fiber';
      } else if (content.includes('github.com/labstack/echo')) {
        info.framework = 'Echo';
      }
    } catch {
      // Skip
    }
  }

  private static async detectRustFramework(
    workspacePath: string,
    info: ProjectInfo
  ): Promise<void> {
    const cargoPath = path.join(workspacePath, 'Cargo.toml');
    if (!(await FileUtils.exists(cargoPath))) {
      return;
    }
    try {
      const content = await FileUtils.readTextFile(cargoPath);
      if (content.includes('actix-web')) {
        info.framework = 'Actix';
      } else if (content.includes('axum')) {
        info.framework = 'Axum';
      } else if (content.includes('rocket')) {
        info.framework = 'Rocket';
      }
    } catch {
      // Skip
    }
  }

  /**
   * T008: Detect package manager from lock files.
   */
  private static async detectPackageManager(
    workspacePath: string,
    info: ProjectInfo
  ): Promise<void> {
    const managers: Array<{ file: string; manager: string }> = [
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
      { file: 'poetry.lock', manager: 'poetry' },
      { file: 'Pipfile.lock', manager: 'pipenv' },
    ];

    for (const { file, manager } of managers) {
      if (await FileUtils.exists(path.join(workspacePath, file))) {
        info.packageManager = manager;
        return;
      }
    }
  }

  private static async detectEaiInitialization(
    workspacePath: string,
    info: ProjectInfo
  ): Promise<void> {
    const eaiConfigDir = path.join(workspacePath, 'src', 'eai.config');
    const objectTypesPath = path.join(eaiConfigDir, 'object-types.ts');
    const registerPath = path.join(eaiConfigDir, 'register.ts');
    const manifestPath = path.join(workspacePath, 'manifest.yml');
    const runtimeContractPath = path.join(workspacePath, 'eai.runtime.json');

    const [hasEaiConfigDir, hasObjectTypes, hasRegister, hasManifest, hasRuntimeContract] =
      await Promise.all([
        FileUtils.exists(eaiConfigDir),
        FileUtils.exists(objectTypesPath),
        FileUtils.exists(registerPath),
        FileUtils.exists(manifestPath),
        FileUtils.exists(runtimeContractPath),
      ]);

    const hasCoreEaiConfig = hasObjectTypes && hasRegister;
    info.eaiInitialized =
      hasRuntimeContract || hasCoreEaiConfig || (hasEaiConfigDir && hasManifest);
  }
}
