import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = path.resolve(__dirname, '../../../.specify/scripts/bash/validate-artifact.sh');

describe('validate-artifact.sh', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('spec validation', () => {
    it('should pass valid spec with all required fields', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `---
id: test-feature
title: Test Feature
status: draft
created: '2026-01-01'
---

# Test Feature

## User Stories

### US1

## Functional Requirements

### FR-001

## Success Criteria

| Metric | Target |
`,
        'utf-8'
      );

      const { stdout } = await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json']);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail when missing required frontmatter id field', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `---
title: Test Feature
status: draft
created: '2026-01-01'
---

# Test Feature

## User Stories

## Requirements

## Success Criteria
`,
        'utf-8'
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json']);
        // If it doesn't throw, check stdout
        expect.fail('Should have exited with code 1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: id');
      }
    });

    it('should fail when missing required section', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `---
id: test
title: Test
status: draft
created: '2026-01-01'
---

# Test

## User Stories

## Success Criteria
`,
        'utf-8'
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json']);
        expect.fail('Should have exited with code 1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('Requirements'))).toBe(true);
      }
    });

    it('should produce warning for legacy spec without frontmatter', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `# Legacy Spec

## User Stories

## Requirements

## Success Criteria
`,
        'utf-8'
      );

      const { stdout } = await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json']);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('legacy'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should produce valid JSON', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `---
id: test
title: Test
status: draft
created: '2026-01-01'
---

# Test

## User Stories

## Requirements

## Success Criteria
`,
        'utf-8'
      );

      const { stdout } = await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json']);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('artifact');
      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });
  });

  describe('strict mode', () => {
    it('should treat warnings as errors in strict mode', async () => {
      const specPath = path.join(tmpDir, 'spec.md');
      fs.writeFileSync(
        specPath,
        `# No Frontmatter Spec

## User Stories

## Requirements

## Success Criteria
`,
        'utf-8'
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'spec', specPath, '--json', '--strict']);
        expect.fail('Should have exited with code 1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        expect(result.valid).toBe(false);
      }
    });

    it('reports a warning-only strict denial without a Bash empty-array error', async () => {
      const planPath = path.join(tmpDir, 'plan.md');
      fs.writeFileSync(
        planPath,
        '# Plan\n\n## Technical Context\n\nComplete.\n\n## Implementation Phases\n\nPhase one.\n'
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'plan', planPath, '--strict']);
        expect.fail('A plan without required frontmatter must be denied');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stdout).toContain('WARNING: No YAML frontmatter found');
        expect(error.stderr).toBe('');
      }
    });

    it('reports an error-only denial without a Bash empty-array error', async () => {
      const planPath = path.join(tmpDir, 'plan.md');
      fs.writeFileSync(
        planPath,
        `---
feature: Test Feature
spec: spec.md
status: ready
created: '2026-01-01'
---

# Plan

## Implementation Phases

Phase one.
`
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'plan', planPath, '--strict']);
        expect.fail('A plan without technical context must be denied');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stdout).toContain(
          'ERROR: Missing section: ## Tech Stack or ## Technical Context'
        );
        expect(error.stderr).toBe('');
      }
    });
  });

  describe('plan validation', () => {
    it('should pass valid plan', async () => {
      const planPath = path.join(tmpDir, 'plan.md');
      fs.writeFileSync(
        planPath,
        `---
feature: Test Feature
spec: spec.md
status: ready
created: '2026-01-01'
---

# Implementation Plan

## Technical Context

### Tech Stack

## Implementation Phases

### Phase 1
`,
        'utf-8'
      );

      const { stdout } = await execFileAsync('bash', [SCRIPT_PATH, 'plan', planPath, '--json']);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
    });
  });

  describe('tasks validation', () => {
    it('should pass valid tasks with task lines', async () => {
      const tasksPath = path.join(tmpDir, 'tasks.md');
      fs.writeFileSync(
        tasksPath,
        `---
feature: Test Feature
plan: plan.md
status: review
created: '2026-01-01'
---

# Tasks

- [ ] T001 First task
- [ ] T002 Second task
`,
        'utf-8'
      );

      const { stdout } = await execFileAsync('bash', [SCRIPT_PATH, 'tasks', tasksPath, '--json']);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
    });

    it('should fail tasks with no task lines', async () => {
      const tasksPath = path.join(tmpDir, 'tasks.md');
      fs.writeFileSync(
        tasksPath,
        `---
feature: Test Feature
plan: plan.md
status: review
created: '2026-01-01'
---

# Tasks

No tasks here.
`,
        'utf-8'
      );

      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'tasks', tasksPath, '--json']);
        expect.fail('Should have exited with code 1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('task lines'))).toBe(true);
      }
    });
  });

  describe('file not found', () => {
    it('should exit with code 2 for missing file', async () => {
      try {
        await execFileAsync('bash', [SCRIPT_PATH, 'spec', '/nonexistent/path/spec.md', '--json']);
        expect.fail('Should have exited with code 2');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.code).toBe(2);
        const result = JSON.parse(error.stdout);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('File not found');
      }
    });
  });
});
