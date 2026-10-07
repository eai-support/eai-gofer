import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'gofer-loop-audit.mjs');

function writeJson(targetPath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runAudit(workspaceRoot: string, featureDir: string, args: string[] = []) {
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
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failed.code ?? 1,
      payload: JSON.parse(failed.stdout || '{}'),
      stderr: failed.stderr || '',
    };
  }
}

function contract(maxIterations = 3) {
  return {
    schemaVersion: 1,
    loopId: 'loop-feature',
    profile: 'standard',
    objective: 'Keep the feature in a bounded check-repair loop.',
    entryStage: '0_gofer_start',
    maxIterations,
    budget: {
      maxWallClockMinutes: null,
      maxModelSpendUsd: null,
      stopOnBudgetWarning: true,
    },
    modelTiers: {
      simple: 'simple',
      medium: 'medium',
      hard: 'hard',
      arbiter: 'arbiter',
    },
    evalCommands: [
      {
        id: 'unit',
        stage: '5_implement',
        command: 'npm test',
        purpose: 'Prove implementation behavior.',
        runWhen: 'after each implementation loop',
      },
    ],
    successCriteria: [
      {
        id: 'SC-001',
        description: 'Loop evidence exists.',
        evidence: ['loop-ledger.jsonl'],
      },
    ],
    stopConditions: [
      {
        id: 'STOP-001',
        description: 'Stop when checks pass.',
        status: 'active',
      },
    ],
    humanEscalation: {
      maxFailedIterations: 3,
      owner: 'feature owner',
      escalateWhen: ['same failure repeats'],
    },
  };
}

describe('gofer-loop-audit.mjs', () => {
  let workspaceRoot = '';
  let featureDir = '';

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-loop-audit-'));
    featureDir = path.join(workspaceRoot, '.specify', 'specs', 'loop-feature');
    fs.mkdirSync(featureDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('initializes loop-contract.json from the default contract', async () => {
    const result = await runAudit(workspaceRoot, featureDir, ['--stage', '1_research', '--init']);

    expect(result.exitCode).toBe(0);
    expect(result.payload.status).toBe('pass');
    expect(result.payload.contractCreated).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'loop-contract.json'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'loop-audit-report.md'))).toBe(true);
  });

  it('fails strict audit when the contract is missing', async () => {
    const result = await runAudit(workspaceRoot, featureDir, ['--strict']);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('fail');
    expect(JSON.stringify(result.payload.blockingFindings)).toContain(
      'loop-contract.json is missing'
    );
  });

  it('runs the documented task preflight before outputs exist and retains the stage-four gate', async () => {
    const guidance = fs.readFileSync(
      path.join(REPO_ROOT, '.specify/commands/4_gofer_tasks.md'),
      'utf8'
    );
    const command = guidance.match(
      /`node \.specify\/scripts\/node\/gofer-loop-audit\.mjs --feature-dir \{FEATURE_DIR\} ([^`]+)`/
    );
    expect(command).not.toBeNull();
    const preflight = await runAudit(workspaceRoot, featureDir, command![1].split(' '));

    expect(preflight.exitCode).toBe(0);
    expect(preflight.payload.status).toBe('pass');
    expect(preflight.payload.contractCreated).toBe(true);
    const initialized = JSON.parse(
      fs.readFileSync(path.join(featureDir, 'loop-contract.json'), 'utf8')
    );
    expect(initialized.requireDeliveryCheckpoint).toBe(true);
    expect(initialized.requirePriorityPlan).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'tasks.md'))).toBe(false);
    expect(fs.existsSync(path.join(featureDir, 'delivery-checkpoint.json'))).toBe(false);

    const gate = await runAudit(workspaceRoot, featureDir, ['--stage', '4_tasks', '--strict']);
    expect(gate.exitCode).toBe(1);
    expect(gate.payload.blockingFindings).toContain(
      'Delivery review: UNREADABLE_ARTIFACT:tasks.md'
    );
    expect(gate.payload.blockingFindings).toContain(
      'Delivery review: MISSING_OR_INVALID_CHECKPOINT'
    );

    fs.writeFileSync(path.join(featureDir, 'spec.md'), 'FR-001: Show the requested result.\n');
    fs.writeFileSync(path.join(featureDir, 'plan.md'), 'Build and verify the requested result.\n');
    fs.writeFileSync(path.join(featureDir, 'tasks.md'), '- [ ] T001 Show the requested result.\n');
    fs.writeFileSync(path.join(featureDir, 'traceability.md'), '| T001 | FR-001 | pending |\n');
    fs.writeFileSync(path.join(featureDir, 'decisions.md'), 'D001: Show the requested result.\n');
    writeJson(path.join(featureDir, 'priority-plan.json'), {
      schemaVersion: 1,
      revision: 'one',
      objective: 'Show the requested result.',
      lastInstruction: { id: 'D001', text: 'Show the requested result.' },
      criticalPath: ['T001'],
      tasks: { T001: { dependsOn: [], allowedEditScope: [] } },
      outcome: {
        id: 'result',
        statement: 'Result checked.',
        requirements: ['FR-001'],
        target: { environment: 'local', revision: 'fixture' },
        receipt: 'outcome.json',
      },
    });
    for (const script of ['gofer-priority-check.mjs', 'gofer-delivery-check.mjs']) {
      const { stdout } = await execFileAsync('node', [
        path.join(REPO_ROOT, '.specify/scripts/node', script),
        '--feature-dir',
        featureDir,
        ...(script === 'gofer-delivery-check.mjs' ? ['--capture'] : []),
      ]);
      expect(JSON.parse(stdout).status).toBe('pass');
    }
    const reviewedGate = await runAudit(workspaceRoot, featureDir, [
      '--stage',
      '4_tasks',
      '--strict',
    ]);
    expect(reviewedGate.exitCode).toBe(0);
    expect(reviewedGate.payload.status).toBe('pass');
    fs.appendFileSync(path.join(featureDir, 'plan.md'), 'Changed scope.\n');
    const staleGate = await runAudit(workspaceRoot, featureDir, ['--stage', '4_tasks', '--strict']);
    expect(staleGate.exitCode).toBe(1);
    expect(staleGate.payload.blockingFindings).toContain('Delivery review: ARTIFACT_DRIFT:plan.md');
    const continuation = guidance.slice(guidance.indexOf('## Step 8:'));
    expect(continuation.indexOf('gofer-delivery-check.mjs')).toBeLessThan(
      continuation.indexOf('--stage 4_tasks --json --strict')
    );
    expect(continuation.indexOf('--stage 4_tasks --json --strict')).toBeLessThan(
      continuation.indexOf('5_gofer_implement.md')
    );
  });

  it('requires ledger evidence for implementation and validation stages', async () => {
    writeJson(path.join(featureDir, 'loop-contract.json'), contract());

    const result = await runAudit(workspaceRoot, featureDir, [
      '--stage',
      '5_implement',
      '--strict',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('fail');
    expect(JSON.stringify(result.payload.blockingFindings)).toContain('loop-ledger.jsonl');
  });

  it('records a loop ledger entry and passes with bounded evidence', async () => {
    writeJson(path.join(featureDir, 'loop-contract.json'), contract());

    const record = JSON.stringify({
      iteration: 1,
      action: 'npm test',
      result: 'pass',
      summary: 'Focused tests passed.',
    });
    const result = await runAudit(workspaceRoot, featureDir, [
      '--stage',
      '5_implement',
      '--record',
      record,
      '--strict',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.payload.status).toBe('pass');
    expect(result.payload.ledgerEntries).toBe(1);
    expect(result.payload.appendedRecord.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fs.readFileSync(path.join(featureDir, 'loop-ledger.jsonl'), 'utf8')).toContain(
      'Focused tests passed'
    );
  });

  it('fails when a ledger iteration exceeds maxIterations', async () => {
    writeJson(path.join(featureDir, 'loop-contract.json'), contract(2));
    fs.writeFileSync(
      path.join(featureDir, 'loop-ledger.jsonl'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        stage: '5_implement',
        iteration: 3,
        action: 'npm test',
        result: 'pass',
        summary: 'Too many loops.',
      })}\n`
    );

    const result = await runAudit(workspaceRoot, featureDir, [
      '--stage',
      '5_implement',
      '--strict',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.payload.status).toBe('fail');
    expect(JSON.stringify(result.payload.blockingFindings)).toContain('exceeds maxIterations');
  });
});
