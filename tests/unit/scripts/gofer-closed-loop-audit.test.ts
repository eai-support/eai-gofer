import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../.specify/scripts/node/gofer-closed-loop-audit.mjs'
);

function padMarkdown(title: string, body = 'Content '.repeat(20)): string {
  return `${title}\n\n${body}\n`;
}

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function setTime(targetPath: string, timeMs: number): void {
  const date = new Date(timeMs);
  fs.utimesSync(targetPath, date, date);
}

function buildSpec(): string {
  return `# Feature Specification: Closed Loop

## Goal Ledger Alignment

| Goal ID | Outcome | Metric / Target | Linked Stories | Linked Requirements |
| ------- | ------- | --------------- | -------------- | ------------------- |
| G1 | Reduce review time | Minutes / < 15 | US1 | FR-001, NFR-001, SC-001 |

### User Story 1 - Goal Seeking Loop (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a goal changes, **When** the audit runs, **Then** the feature reopens the right stage

## Requirements

### Functional Requirements

- **FR-001**: System MUST keep a goal ledger aligned with the spec

### Non-Functional Requirements

- **NFR-001**: System MUST detect requirement drift before release

## Success Criteria

- **SC-001**: Teams can identify stale pipeline artifacts before merge
`;
}

function buildTemplateSpec(): string {
  return `# Feature Specification: [FEATURE NAME]

**Feature Branch**: \`[###-feature-name]\`

## Requirements

<!-- ACTION REQUIRED -->

- **FR-001**: System MUST [specific capability]
`;
}

function buildTraceability(
  codeEvidence = 'src/example.ts',
  testEvidence = 'tests/example.test.ts'
): string {
  return `# Traceability

## Requirement Trace Matrix

| Requirement ID | Goal ID | Code Evidence | Test Evidence | Status |
| -------------- | ------- | ------------- | ------------- | ------ |
| FR-001 | G1 | ${codeEvidence} | ${testEvidence} | PASS |
| NFR-001 | G1 | ${codeEvidence} | ${testEvidence} | PASS |
| SC-001 | G1 | ${codeEvidence} | ${testEvidence} | PASS |
| US1 AC-1 | G1 | ${codeEvidence} | ${testEvidence} | PASS |
`;
}

function buildAssumptions(expiresAt: string): string {
  return `# Assumptions

## Drift Controls

| Assumption ID | Status | Owner | Expires At | Revalidate Trigger | Reopen Stage |
| ------------- | ------ | ----- | ---------- | ------------------ | ------------ |
| A1 | UNVALIDATED | team | ${expiresAt} | Goal changes | 1_research |
`;
}

function buildGoalLedger(featureDir: string): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      featureId: path.basename(featureDir),
      featureName: 'closed-loop',
      status: 'active',
      lastRebaselineAt: '2026-06-13T00:00:00Z',
      objectiveConfidence: 'medium',
      goals: [
        {
          id: 'G1',
          goal: 'Reduce review time',
          metric: 'Minutes',
          target: '< 15',
          owner: 'team',
          status: 'active',
          confidence: 'medium',
          lastChangedAt: '2026-06-13T00:00:00Z',
          trace: {
            stories: ['US1'],
            requirements: ['FR-001', 'NFR-001', 'SC-001', 'US1 AC-1'],
            tasks: ['T001'],
            code: ['src/example.ts'],
            tests: ['tests/example.test.ts'],
          },
        },
      ],
      deliveryStates: [
        {
          capability: 'closed-loop-audit',
          currentState: 'live',
          targetState: 'live',
          owner: 'team',
          promotionCriteria: ['Validation report updated'],
          blockedBy: [],
        },
      ],
      assumptionDrift: [
        {
          assumptionId: 'A1',
          owner: 'team',
          expiresAt: '2026-06-30T00:00:00Z',
          revalidateTrigger: 'Goal changes',
          reopenStage: '1_research',
        },
      ],
      reloopTriggers: [
        {
          id: 'R1',
          label: 'Goal ledger drift',
          watch: ['goal-ledger.json'],
          baselineArtifact: 'spec.md',
          reopenStage: '2_specify',
        },
      ],
    },
    null,
    2
  );
}

function createFeatureFixture(workspaceRoot: string): string {
  const featureDir = path.join(workspaceRoot, '.specify', 'specs', 'closed-loop');
  writeFile(path.join(featureDir, 'spec.md'), buildSpec());
  writeFile(path.join(featureDir, 'plan.md'), padMarkdown('# Plan'));
  writeFile(
    path.join(featureDir, 'tasks.md'),
    padMarkdown('# Tasks\n\n- [ ] T001 Maintain goal ledger')
  );
  writeFile(path.join(featureDir, 'traceability.md'), buildTraceability());
  writeFile(path.join(featureDir, 'assumptions.md'), buildAssumptions('2026-06-30T00:00:00Z'));
  writeFile(path.join(featureDir, 'goal-ledger.json'), buildGoalLedger(featureDir));
  writeFile(path.join(featureDir, 'validation-report.md'), padMarkdown('# Validation Report'));
  writeFile(path.join(workspaceRoot, 'src', 'example.ts'), 'export const example = true;\n');
  writeFile(
    path.join(workspaceRoot, 'tests', 'example.test.ts'),
    'test("example", () => expect(true).toBe(true));\n'
  );

  const base = Date.now() - 60_000;
  setTime(path.join(featureDir, 'goal-ledger.json'), base);
  setTime(path.join(featureDir, 'spec.md'), base + 1_000);
  setTime(path.join(featureDir, 'plan.md'), base + 2_000);
  setTime(path.join(featureDir, 'tasks.md'), base + 3_000);
  setTime(path.join(featureDir, 'traceability.md'), base + 4_000);
  setTime(path.join(workspaceRoot, 'src', 'example.ts'), base + 5_000);
  setTime(path.join(workspaceRoot, 'tests', 'example.test.ts'), base + 5_000);
  setTime(path.join(featureDir, 'validation-report.md'), base + 6_000);
  setTime(path.join(featureDir, 'assumptions.md'), base + 6_000);

  return featureDir;
}

async function runAudit(
  workspaceRoot: string,
  featureDir: string,
  args: string[] = []
): Promise<{ exitCode: number; payload: Record<string, unknown> }> {
  try {
    const { stdout } = await execFileAsync('node', [
      SCRIPT_PATH,
      '--workspace',
      workspaceRoot,
      '--feature-dir',
      featureDir,
      '--json',
      ...args,
    ]);
    return {
      exitCode: 0,
      payload: JSON.parse(stdout),
    };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string };
    return {
      exitCode: failed.code ?? 1,
      payload: JSON.parse(failed.stdout || '{}'),
    };
  }
}

describe('gofer-closed-loop-audit.mjs', () => {
  let workspaceRoot = '';
  let featureDir = '';

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-closed-loop-audit-'));
    featureDir = createFeatureFixture(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reports a healthy feature when goal, traceability, and validation artifacts align', async () => {
    const result = await runAudit(workspaceRoot, featureDir);

    expect(result.exitCode).toBe(0);
    expect(result.payload.status).toBe('healthy');
    expect(result.payload.recommendedStartStage).toBeNull();
  });

  it('recommends /2_gofer_specify when the goal ledger is newer than the spec', async () => {
    setTime(path.join(featureDir, 'goal-ledger.json'), Date.now() + 5_000);

    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('drift');
    expect(result.payload.recommendedStartStage).toBe('2_specify');
  });

  it('fails when the traceability matrix is missing code or test evidence', async () => {
    writeFile(path.join(featureDir, 'traceability.md'), buildTraceability('—', '—'));

    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('fail');
    expect(result.payload.recommendedStartStage).toBe('4_tasks');
  });

  it('reopens specify when spec.md is still the bootstrap template', async () => {
    writeFile(path.join(featureDir, 'spec.md'), buildTemplateSpec());

    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('fail');
    expect(result.payload.recommendedStartStage).toBe('2_specify');
    expect(JSON.stringify(result.payload.blockingFindings)).toContain('spec.md is template');
  });

  it('reopens research when an assumption drift control has expired', async () => {
    writeFile(path.join(featureDir, 'assumptions.md'), buildAssumptions('2020-01-01T00:00:00Z'));

    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.recommendedStartStage).toBe('1_research');
  });

  it('reopens validation when repo-root watched paths move after validation', async () => {
    const validationPath = path.join(featureDir, 'validation-report.md');
    const srcPath = path.join(workspaceRoot, 'src', 'example.ts');

    setTime(validationPath, Date.now() - 10_000);
    setTime(srcPath, Date.now());

    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('drift');
    expect(result.payload.recommendedStartStage).toBe('6_validate');
  });
});
