import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECK_PREREQUISITES = path.join(
  REPO_ROOT,
  '.specify',
  'scripts',
  'bash',
  'check-prerequisites.sh'
);
const SETUP_PLAN = path.join(REPO_ROOT, '.specify', 'scripts', 'bash', 'setup-plan.sh');

function isolatedGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_PREFIX',
    'GIT_WORK_TREE',
  ]) {
    delete env[key];
  }
  return env;
}

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function runScript(workspaceRoot: string, scriptPath: string, args: string[]) {
  const result = spawnSync('bash', [scriptPath, ...args], {
    cwd: workspaceRoot,
    env: isolatedGitEnv(),
    encoding: 'utf8',
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const RAW_TEMPLATE_SPEC = `# Feature Specification: [FEATURE NAME]

**Feature Branch**: \`[###-feature-name]\`

## Requirements

<!-- ACTION REQUIRED -->

- **FR-001**: System MUST [specific capability]
`;

const MATERIAL_SPEC = `# Feature Specification: Guarded Planning

## User Scenarios & Testing

### User Story 1 - Spec guard (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a downstream stage starts, **When** spec.md is present, **Then** it uses real acceptance criteria

## Requirements

### Functional Requirements

- **FR-001**: System MUST block downstream stages when the feature specification is missing
`;

describe('spec artifact guard scripts', () => {
  let workspaceRoot = '';
  let featureDir = '';

  beforeEach(() => {
    workspaceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-spec-guard-')));
    execFileSync('git', ['init', '-q'], {
      cwd: workspaceRoot,
      env: isolatedGitEnv(),
      stdio: 'ignore',
    });
    execFileSync('git', ['checkout', '-b', '001-spec-guard'], {
      cwd: workspaceRoot,
      env: isolatedGitEnv(),
      stdio: 'ignore',
    });

    featureDir = path.join(workspaceRoot, '.specify', 'specs', '001-spec-guard');
    fs.mkdirSync(featureDir, { recursive: true });
    writeFile(path.join(workspaceRoot, '.specify', 'templates', 'plan-template.md'), '# Plan\n');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('rejects downstream prerequisites when spec.md is missing', () => {
    writeFile(path.join(featureDir, 'plan.md'), '# Plan\n');

    const result = runScript(workspaceRoot, CHECK_PREREQUISITES, ['--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('spec.md is missing');
    expect(result.stderr).toContain('/2_gofer_specify');
  });

  it('rejects downstream prerequisites when spec.md is still the raw template', () => {
    writeFile(path.join(featureDir, 'spec.md'), RAW_TEMPLATE_SPEC);
    writeFile(path.join(featureDir, 'plan.md'), '# Plan\n');

    const result = runScript(workspaceRoot, CHECK_PREREQUISITES, ['--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('spec.md is template');
    expect(result.stderr).toContain('real feature specification');
  });

  it('allows downstream prerequisites when spec.md is material', () => {
    writeFile(path.join(featureDir, 'spec.md'), MATERIAL_SPEC);
    writeFile(path.join(featureDir, 'plan.md'), '# Plan\n');

    const result = runScript(workspaceRoot, CHECK_PREREQUISITES, ['--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      FEATURE_DIR: featureDir,
    });
  });

  it('does not create plan.md when setup-plan sees a template spec', () => {
    writeFile(path.join(featureDir, 'spec.md'), RAW_TEMPLATE_SPEC);

    const result = runScript(workspaceRoot, SETUP_PLAN, ['--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('spec.md is template');
    expect(fs.existsSync(path.join(featureDir, 'plan.md'))).toBe(false);
  });

  it('creates plan.md when setup-plan sees a material spec', () => {
    writeFile(path.join(featureDir, 'spec.md'), MATERIAL_SPEC);

    const result = runScript(workspaceRoot, SETUP_PLAN, ['--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.split('\n').at(-2) || result.stdout)).toMatchObject({
      FEATURE_SPEC: path.join(featureDir, 'spec.md'),
      IMPL_PLAN: path.join(featureDir, 'plan.md'),
    });
    expect(fs.existsSync(path.join(featureDir, 'plan.md'))).toBe(true);
  });
});
