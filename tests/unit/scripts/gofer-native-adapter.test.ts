import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import {
  createVerifiedWorktree,
  inspectVerifiedWorktree,
  createLedgerBoundCodexExecutor,
  invokeLedgerBoundNative,
  startLocalCodexInvocation,
  inspectNativeWorkerEvidence,
} from '../../../.specify/scripts/node/gofer-native-adapter.mjs';
import { createVerifiedNativeRuntime } from '../../../.specify/scripts/node/gofer-native-runtime.mjs';

type LedgerRequest = Record<string, unknown>;
type NativeStartRequest = LedgerRequest & { capabilityReceiptHash: string };

function localIsolation(workspaceRoot: string) {
  return {
    contractVersion: 'eai.local-isolation/v1',
    projectDirectory: workspaceRoot,
    cloudExecution: 'prohibited',
    gitRepository: true,
    assessments: [
      {
        surfaceId: 'codex-cli',
        status: 'ready',
        localOnly: true,
        requiresGitWorktree: true,
        requiresOsSandbox: true,
        hostArguments: ['--sandbox', 'workspace-write'],
        missing: [],
      },
    ],
  };
}

describe('native adapter primitives', () => {
  it('creates the graph runtime only after both ledger authority boundaries are configured', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-runtime-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const keys = generateKeyPairSync('ed25519');
      const receipt = createCapabilityReceipt({
        host: 'codex',
        evaluatorVersion: '2',
        evaluationId: 'id',
        evaluatedAt: '2026-09-17T00:00:00.000Z',
        expiresAt: '2026-09-18T00:00:00.000Z',
        hostVersion: 'codex',
        models: [{ id: 'live', reasoningEfforts: ['high'] }],
        reasoningCapabilities: ['high'],
        toolCapabilities: ['shell'],
        grantedPermissions: ['workspace-write'],
        isolationClass: 'git-worktree+local-os-sandbox',
        provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
        signingKey: keys.privateKey,
      });
      const runtime = await createVerifiedNativeRuntime({
        workspaceRoot: root,
        localIsolation: localIsolation(root),
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        ledger: {
          authorize: async () => ({ allowed: false }),
          authorizeCommit: async () => ({ allowed: false }),
        },
        nativeLedger: async () => ({ allowed: false }),
        promptForRequest: async () => 'Approved task.',
        adapter: {
          reserve: async () => ({}),
          lease: async () => ({}),
          inputRevision: async () => 'input',
          check: async () => ({}),
          verified: async () => ({}),
        },
      });
      expect(runtime.isolation.isolatedWorkspace).not.toBe(root);
      execFileSync('git', [
        '-C',
        root,
        'worktree',
        'remove',
        '--force',
        runtime.isolation.isolatedWorkspace,
      ]);
      await expect(createVerifiedNativeRuntime({ workspaceRoot: root })).rejects.toThrow(
        'VERIFIED_NATIVE_RUNTIME_CONFIGURATION_REQUIRED'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('binds graph dispatch to the same ledger authority that approved it', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const start = vi.fn(async (request: NativeStartRequest) => ({
      invocationId: 'native-1',
      cancel: async () => {},
      inspect: async () => ({ invocationId: 'native-1', cancelled: false, receipt: 'complete' }),
      wait: async () => ({
        invocationId: 'native-1',
        capabilityReceiptHash: request.capabilityReceiptHash,
        receipt: 'complete',
        changedFiles: [],
      }),
    }));
    const executor = createLedgerBoundCodexExecutor({
      isolatedWorkspace: '/isolated',
      worktreeReceipt: 'worktree-1',
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      promptForRequest: async () => 'Complete the approved task.',
      start,
      assertLedger: async (request: LedgerRequest) => ({
        allowed: true,
        ...request,
        isolation: 'git-worktree+local-os-sandbox',
        receipt: 'graph-ledger-receipt',
      }),
    });
    await expect(
      executor.execute({
        taskId: 'T001',
        revision: 'objective-1',
        allowedEditScope: ['src/'],
        leaseId: 'lease-1',
        budgetReservation: 'reservation-1',
        approvalReceipt: 'approval-1',
        ledgerAuthorityReceipt: 'graph-ledger-receipt',
        worktreeReceipt: 'worktree-1',
        selectedModel: 'live',
        usageReporting: true,
      })
    ).resolves.toMatchObject({ invocationId: 'native-1', receipt: 'complete' });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        isolatedWorkspace: '/isolated',
        modelId: 'live',
        prompt: 'Complete the approved task.',
        objectiveRevision: 'objective-1',
        allowedWriteScope: ['src/'],
        usageReporting: true,
      })
    );
  });

  it('refuses a graph dispatch when the ledger cannot reproduce its authority receipt', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const start = vi.fn();
    const executor = createLedgerBoundCodexExecutor({
      isolatedWorkspace: '/isolated',
      worktreeReceipt: 'worktree-1',
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      promptForRequest: async () => 'Complete the approved task.',
      start,
      assertLedger: async (request: LedgerRequest) => ({
        allowed: true,
        ...request,
        isolation: 'git-worktree+local-os-sandbox',
        receipt: 'different-ledger-receipt',
      }),
    });
    await expect(
      executor.execute({
        taskId: 'T001',
        revision: 'objective-1',
        allowedEditScope: ['src/'],
        leaseId: 'lease-1',
        budgetReservation: 'reservation-1',
        approvalReceipt: 'approval-1',
        ledgerAuthorityReceipt: 'graph-ledger-receipt',
        worktreeReceipt: 'worktree-1',
        selectedModel: 'live',
      })
    ).rejects.toThrow('LEDGER_AUTHORITY_REQUIRED');
    expect(start).not.toHaveBeenCalled();
  });

  it('starts Codex locally with its sandbox and returns only scoped worktree changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const spawnProcess = vi.fn(() => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: vi.fn(() => true),
        });
        setTimeout(async () => {
          child.stdout.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                type: 'turn.completed',
                usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 30 },
              }) + '\n'
            )
          );
          await writeFile(path.join(root, 'tracked.txt'), 'changed');
          child.emit('close', 0, null);
        }, 0);
        return child;
      });
      const invocation = await startLocalCodexInvocation({
        isolatedWorkspace: root,
        prompt: 'Update only tracked.txt',
        modelId: 'live-model',
        capabilityReceiptHash: 'receipt-hash',
        allowedWriteScope: ['tracked.txt'],
        usageReporting: true,
        spawnProcess,
      });
      await expect(invocation.wait()).resolves.toMatchObject({
        invocationId: expect.stringMatching(/^codex-/),
        capabilityReceiptHash: 'receipt-hash',
        changedFiles: ['tracked.txt'],
        isolation: 'git-worktree+local-os-sandbox',
        usage: { inputTokens: 120, cachedInputTokens: 40, outputTokens: 30 },
      });
      expect(spawnProcess).toHaveBeenCalledOnce();
      expect(spawnProcess.mock.calls[0][0]).toBe('codex');
      expect(spawnProcess.mock.calls[0][1]).toEqual(
        expect.arrayContaining([
          'exec',
          '--sandbox',
          'workspace-write',
          '--json',
          '--model',
          'live-model',
          'Update only tracked.txt',
        ])
      );
      expect(spawnProcess.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          cwd: expect.stringContaining(path.basename(root)),
          shell: false,
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('confirms the Codex process has exited before treating cancellation as complete', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(() => {
          setTimeout(() => child.emit('close', null, 'SIGTERM'), 0);
          return true;
        }),
      });
      const invocation = await startLocalCodexInvocation({
        isolatedWorkspace: root,
        prompt: 'Stop safely',
        modelId: 'live-model',
        capabilityReceiptHash: 'receipt-hash',
        allowedWriteScope: ['tracked.txt'],
        spawnProcess: () => child,
      });
      await invocation.cancel();
      await expect(invocation.inspect()).resolves.toMatchObject({
        cancelled: true,
        state: 'exited',
      });
      await expect(invocation.wait()).resolves.toMatchObject({
        cancelled: true,
        capabilityReceiptHash: 'receipt-hash',
      });
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'durably records a local worker start and confirmed cancellation outside its worktree',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-worktree-'));
      const evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'gofer-native-evidence-'));
      try {
        const child = Object.assign(new EventEmitter(), {
          pid: 99999999,
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: vi.fn(() => true),
        });
        const signalProcessGroup = vi.fn(() => {
          setTimeout(() => child.emit('close', null, 'SIGTERM'), 0);
          return true;
        });
        const invocation = await startLocalCodexInvocation({
          isolatedWorkspace: root,
          prompt: 'Stop safely',
          modelId: 'live-model',
          capabilityReceiptHash: 'capability',
          allowedWriteScope: ['tracked.txt'],
          objectiveRevision: 'objective-v1',
          leaseId: 'lease-v1',
          worktreeReceipt: 'worktree-v1',
          evidenceDirectory,
          spawnProcess: () => child,
          signalProcessGroup,
        });
        const [name] = await readdir(evidenceDirectory);
        expect(name).toMatch(/^native-worker-codex-.+\.jsonl$/);
        const started = (await readFile(path.join(evidenceDirectory, name), 'utf8'))
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(started).toHaveLength(1);
        expect(started[0]).toMatchObject({
          event: 'started',
          pid: child.pid,
          objectiveRevision: 'objective-v1',
          leaseId: 'lease-v1',
          worktreeReceipt: 'worktree-v1',
        });
        const inspection = {
          evidenceDirectory,
          revision: 'objective-v1',
          journalHash: 'journal-v1',
          authorizations: [
            {
              leaseId: 'lease-v1',
              worktreeReceipt: 'worktree-v1',
              capabilityReceiptHash: 'capability',
            },
          ],
          probeProcess: () => false,
        };
        expect((await inspectNativeWorkerEvidence(inspection)).allStopped).toBe(false);
        await invocation.cancel();
        expect(signalProcessGroup).toHaveBeenCalledWith(child.pid, 'SIGTERM');
        const records = (await readFile(path.join(evidenceDirectory, name), 'utf8'))
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(records).toHaveLength(2);
        expect(records[1]).toMatchObject({
          event: 'stopped',
          invocationId: started[0].invocationId,
          pid: child.pid,
          cancelled: true,
          exit: { code: null, signal: 'SIGTERM' },
          receipt: expect.any(String),
        });
        expect(await inspectNativeWorkerEvidence(inspection)).toMatchObject({
          allStopped: true,
          cancelledLeases: ['lease-v1'],
          receipt: expect.stringMatching(/^worker-stop:/),
        });
        expect(
          (await inspectNativeWorkerEvidence({ ...inspection, probeProcess: () => true }))
            .allStopped
        ).toBe(false);
        expect(
          (
            await inspectNativeWorkerEvidence({
              ...inspection,
              authorizations: [{ ...inspection.authorizations[0], worktreeReceipt: 'forged' }],
            })
          ).allStopped
        ).toBe(false);
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(evidenceDirectory, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(process.platform === 'win32')(
    'does not place worker-stop evidence inside the model worktree',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-worktree-'));
      const spawnProcess = vi.fn();
      try {
        await expect(
          startLocalCodexInvocation({
            isolatedWorkspace: root,
            prompt: 'Stop safely',
            modelId: 'live-model',
            capabilityReceiptHash: 'capability',
            allowedWriteScope: ['tracked.txt'],
            objectiveRevision: 'objective-v1',
            leaseId: 'lease-v1',
            worktreeReceipt: 'worktree-v1',
            evidenceDirectory: path.join(root, 'evidence'),
            spawnProcess,
          })
        ).rejects.toThrow('NATIVE_EVIDENCE_INSIDE_WORKTREE');
        expect(spawnProcess).not.toHaveBeenCalled();
        expect(await readdir(root)).toEqual([]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(process.platform === 'win32')(
    'stops a real local process group before issuing a worker-stop proof',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-worktree-'));
      const evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'gofer-native-evidence-'));
      let readyResolve: (value: string) => void;
      const ready = new Promise<string>((resolve) => {
        readyResolve = resolve;
      });
      const script =
        "const { spawn } = require('node:child_process');" +
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
        "process.stdout.write('ready:' + child.pid + '\\n'); setInterval(() => {}, 1000);";
      let invocation: Awaited<ReturnType<typeof startLocalCodexInvocation>> | undefined;
      try {
        invocation = await startLocalCodexInvocation({
          isolatedWorkspace: root,
          prompt: 'No model call',
          modelId: 'local-test',
          capabilityReceiptHash: 'capability',
          allowedWriteScope: ['tracked.txt'],
          objectiveRevision: 'objective-v1',
          leaseId: 'lease-v1',
          worktreeReceipt: 'worktree-v1',
          evidenceDirectory,
          spawnProcess: (
            _command: string,
            _args: string[],
            options: Parameters<typeof spawn>[2]
          ) => {
            const child = spawn(process.execPath, ['-e', script], options);
            child.stdout?.once('data', (chunk) => readyResolve(String(chunk)));
            return child;
          },
        });
        await expect(
          Promise.race([
            ready,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('PROCESS_NOT_READY')), 2000)
            ),
          ])
        ).resolves.toMatch(/^ready:\d+/);
        await invocation.cancel();
        const proof = await inspectNativeWorkerEvidence({
          evidenceDirectory,
          revision: 'objective-v1',
          journalHash: 'journal-v1',
          authorizations: [
            {
              leaseId: 'lease-v1',
              worktreeReceipt: 'worktree-v1',
              capabilityReceiptHash: 'capability',
            },
          ],
        });
        expect(proof.allStopped).toBe(true);
      } finally {
        await invocation?.cancel().catch(() => {});
        await rm(root, { recursive: true, force: true });
        await rm(evidenceDirectory, { recursive: true, force: true });
      }
    }
  );

  it('creates a detached worktree at the verified source revision', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const isolated = await createVerifiedWorktree({
        workspaceRoot: root,
        host: 'codex',
        localIsolation: localIsolation(root),
      });
      expect(isolated.isolationClass).toBe('git-worktree+local-os-sandbox');
      expect(isolated.isolatedWorkspace).not.toBe(isolated.workspace);
      const replacement = await createVerifiedWorktree({
        workspaceRoot: root,
        host: 'codex',
        localIsolation: localIsolation(root),
      });
      expect(replacement.receipt).not.toBe(isolated.receipt);
      expect(
        (
          await inspectVerifiedWorktree({
            workspaceRoot: root,
            isolatedWorkspace: replacement.isolatedWorkspace,
            revision: replacement.revision,
            receipt: replacement.receipt,
            requireClean: true,
          })
        ).valid
      ).toBe(true);
      await writeFile(path.join(isolated.isolatedWorkspace, 'tracked.txt'), 'partial work');
      expect(
        (
          await inspectVerifiedWorktree({
            workspaceRoot: root,
            isolatedWorkspace: isolated.isolatedWorkspace,
            revision: isolated.revision,
            receipt: isolated.receipt,
            requireClean: true,
          })
        ).valid
      ).toBe(false);
      expect(
        (
          await inspectVerifiedWorktree({
            workspaceRoot: root,
            isolatedWorkspace: isolated.isolatedWorkspace,
            revision: isolated.revision,
            receipt: isolated.receipt,
          })
        ).valid
      ).toBe(true);
      execFileSync('git', [
        '-C',
        root,
        'worktree',
        'remove',
        '--force',
        isolated.isolatedWorkspace,
      ]);
      execFileSync('git', [
        '-C',
        root,
        'worktree',
        'remove',
        '--force',
        replacement.isolatedWorkspace,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an isolation root inside the source workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      await expect(
        createVerifiedWorktree({
          workspaceRoot: root,
          host: 'codex',
          localIsolation: localIsolation(root),
          temporaryRoot: root,
        })
      ).rejects.toThrow('ISOLATION_ROOT_INSIDE_WORKSPACE');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a worktree when the EAI isolation contract is missing or bypassable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      await expect(createVerifiedWorktree({ workspaceRoot: root, host: 'codex' })).rejects.toThrow(
        'LOCAL_SANDBOX_REQUIRED'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires ledger authority and confirms cancellation', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const request = {
      objectiveRevision: 'r1',
      allowedWriteScope: ['src/'],
      leaseId: 'lease',
      budgetReservation: 'budget',
      approvalReceipt: 'approval',
    };
    const result = await invokeLedgerBoundNative({
      request,
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      assertLedger: async (value) => ({
        allowed: true,
        ...value,
        isolation: 'git-worktree+local-os-sandbox',
      }),
      start: async (value) => ({
        invocationId: 'run-1',
        cancel: async () => {},
        inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        wait: async () => ({
          invocationId: 'run-1',
          capabilityReceiptHash: value.capabilityReceiptHash,
          receipt: 'finished',
        }),
      }),
    });
    expect(result.isolation).toBe('git-worktree+local-os-sandbox');
    const start = vi.fn();
    await expect(
      invokeLedgerBoundNative({
        request,
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          ...value,
          allowed: true,
          allowedWriteScope: ['src/', 'broader/'],
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start,
      })
    ).rejects.toThrow('LEDGER_AUTHORITY_REQUIRED');
    expect(start).not.toHaveBeenCalled();
  });

  it('cancels and confirms a malformed native invocation before failing closed', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const cancel = vi.fn(async () => {});
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          allowed: true,
          ...value,
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start: async () => ({
          invocationId: 'run-1',
          cancel,
          inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        }),
      })
    ).rejects.toThrow('NATIVE_INVOCATION_REQUIRED');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not return from an aborted invocation until cancellation is confirmed', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      invokeLedgerBoundNative({
        signal: controller.signal,
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          allowed: true,
          ...value,
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start: async () => ({
          invocationId: 'run-1',
          cancel: async () => {},
          inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
          wait: async () => ({ invocationId: 'run-1', receipt: 'finished' }),
        }),
      })
    ).rejects.toThrow('NATIVE_INVOCATION_CANCELLED');
  });

  it('waits for a mid-flight cancellation before returning', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const controller = new AbortController();
    let releaseCancellation: () => void;
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const outcome = invokeLedgerBoundNative({
      signal: controller.signal,
      request: {
        objectiveRevision: 'r1',
        allowedWriteScope: ['src/'],
        leaseId: 'lease',
        budgetReservation: 'budget',
        approvalReceipt: 'approval',
      },
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      assertLedger: async (value) => ({
        allowed: true,
        ...value,
        isolation: 'git-worktree+local-os-sandbox',
      }),
      start: async () => ({
        invocationId: 'run-1',
        cancel: async () => cancellation,
        inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        wait: async () => {
          controller.abort();
          return { invocationId: 'run-1', receipt: 'finished' };
        },
      }),
    });
    let settled = false;
    void outcome.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseCancellation!();
    await expect(outcome).rejects.toThrow('NATIVE_INVOCATION_CANCELLED');
  });

  it('refuses a native invocation with an unauthenticated capability receipt', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        assertLedger: async () => ({ allowed: true }),
        start: async () => ({}),
      })
    ).rejects.toThrow('CAPABILITY_RECEIPT_REQUIRED');
  });

  it('refuses a signed receipt that has a worktree but no OS sandbox', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const start = vi.fn();
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async () => ({ allowed: true }),
        start,
      })
    ).rejects.toThrow('CAPABILITY_RECEIPT_REQUIRED');
    expect(start).not.toHaveBeenCalled();
  });
});
