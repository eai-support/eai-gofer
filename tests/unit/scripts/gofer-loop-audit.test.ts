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
