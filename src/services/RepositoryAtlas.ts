import fs from 'node:fs';
import path from 'node:path';

export type RepositoryLanguage =
  'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'unknown';
export type RepositoryFramework =
  'react' | 'nextjs' | 'vite' | 'express' | 'fastapi' | 'django' | 'node' | 'unknown';

export interface RepositoryAtlas {
  root: string;
  repositoryName: string;
  languages: RepositoryLanguage[];
  frameworks: RepositoryFramework[];
  packageManagers: string[];
  testCommands: string[];
  importantFiles: string[];
  hasSpecWorkspace: boolean;
}

const LANGUAGE_MARKERS: Array<[RepositoryLanguage, string[]]> = [
  ['typescript', ['tsconfig.json']],
  ['javascript', ['package.json']],
  ['python', ['pyproject.toml', 'requirements.txt']],
  ['go', ['go.mod']],
  ['rust', ['Cargo.toml']],
  ['java', ['pom.xml', 'build.gradle']],
];

function exists(root: string, relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function readJson<T>(root: string, relativePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function buildRepositoryAtlas(root: string): RepositoryAtlas {
  const packageJson = readJson<{
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(root, 'package.json');
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  const languages = LANGUAGE_MARKERS.filter(([, markers]) =>
    markers.some((marker) => exists(root, marker))
  ).map(([language]) => language);

  const frameworks: RepositoryFramework[] = [];
  if (dependencies.next) {
    frameworks.push('nextjs');
  }
  if (dependencies.react) {
    frameworks.push('react');
  }
  if (dependencies.vite) {
    frameworks.push('vite');
  }
  if (dependencies.express) {
    frameworks.push('express');
  }
  if (exists(root, 'pyproject.toml') || exists(root, 'requirements.txt')) {
    const pyProject = exists(root, 'pyproject.toml')
      ? fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8')
      : '';
    const requirements = exists(root, 'requirements.txt')
      ? fs.readFileSync(path.join(root, 'requirements.txt'), 'utf8')
      : '';
    if (/fastapi/i.test(`${pyProject}\n${requirements}`)) {
      frameworks.push('fastapi');
    }
    if (/django/i.test(`${pyProject}\n${requirements}`)) {
      frameworks.push('django');
    }
  }
  if (packageJson && frameworks.length === 0) {
    frameworks.push('node');
  }

  const scripts = packageJson?.scripts ?? {};
  const testCommands = Object.keys(scripts)
    .filter((name) => /(^test$|test:|:test$|lint|typecheck|build)/.test(name))
    .map((name) => `npm run ${name}`);

  const packageManagers = [
    exists(root, 'package-lock.json') ? 'npm' : undefined,
    exists(root, 'pnpm-lock.yaml') ? 'pnpm' : undefined,
    exists(root, 'yarn.lock') ? 'yarn' : undefined,
    exists(root, 'uv.lock') ? 'uv' : undefined,
  ].filter(Boolean) as string[];

  const importantFiles = [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    '.specify/commands',
    '.specify/specs',
  ].filter((candidate) => exists(root, candidate));

  return {
    root,
    repositoryName: path.basename(root),
    languages: uniq(languages.length ? languages : ['unknown']),
    frameworks: uniq(frameworks.length ? frameworks : ['unknown']),
    packageManagers,
    testCommands,
    importantFiles,
    hasSpecWorkspace: exists(root, '.specify'),
  };
}
