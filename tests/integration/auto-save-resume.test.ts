/**
 * Integration test for Auto-Save/Continue flow (Gap #1 + Gap #2 fixes)
 *
 * Exercises the full chain:
 *   ContextHealthMonitor detects 65% threshold
 *   → AutoHandoffTrigger sends /7_gofer_save to the active terminal
 *   → Polls for session-checkpoint.md (Gap #1: replaces fixed 3s wait)
 *   → Sends /clear then a checkpoint continuation prompt to the same terminal
 *     (save/clear/continue cycle)
 *
 * NOTE: Terminal commands are sent with a short delay between entries so the
 * host CLI has time to process the save/clear/continue sequence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock Logger
vi.mock('../../extension/src/utils/logger', () => ({
  Logger: {
    for: (): object => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock VSCode API
vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn().mockResolvedValue(null),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  workspace: {
    workspaceFolders: undefined,
    onDidSaveTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
}));

// Import after mocks
import { ContextHealthMonitor } from '../../extension/src/autonomous/ContextHealthMonitor';
import { AutoHandoffTrigger } from '../../extension/src/autonomous/AutoHandoffTrigger';
import { ContextUsageLogger } from '../../extension/src/autonomous/ContextUsageLogger';

// Mock ContextUsageLogger
vi.mock('../../extension/src/autonomous/ContextUsageLogger', () => ({
  ContextUsageLogger: vi.fn().mockImplementation(() => ({
    logHandoff: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('Auto-Save/Resume Integration', () => {
  let tmpDir: string;
  let specDir: string;
  let monitor: ContextHealthMonitor;
  let trigger: AutoHandoffTrigger;
  let mockPty: { write: ReturnType<typeof vi.fn> };
  let mockLogger: { logHandoff: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create real temp workspace with spec structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-autosave-'));
    specDir = path.join(tmpDir, '.specify', 'specs', 'feature-001');
    fs.mkdirSync(specDir, { recursive: true });

    // Create mocks
    mockPty = { sendText: vi.fn() };
    mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };

    // Set up monitor and trigger
    monitor = new ContextHealthMonitor({
      autoSaveThreshold: 0.65,
      effectiveContextLimit: 120000,
    });

    trigger = new AutoHandoffTrigger(
      {
        autoExecuteSave: true,
        autoResumeAfterSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      },
      tmpDir
    );

    trigger.setClaudeVscodeTerminal(mockPty as unknown as typeof vscode.Terminal.prototype);
    trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
    trigger.setSessionContext('integration-test', 'implement', 'T001');
    trigger.connect(monitor);
  });

  afterEach(() => {
    trigger.dispose();
    monitor.dispose();
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should wait for checkpoint file before sending /clear and the continuation prompt (Gap #1)', async () => {
    let utilization = 54000; // 45%

    monitor.setContextProvider(() => ({
      breakdown: { conversation: utilization },
      dataSource: 'real' as const,
    }));

    monitor.startMonitoring(30000);

    // Cross 65% threshold — triggers auto-save
    utilization = 80000; // 67%
    monitor.checkHealth();

    // Verify /7_gofer_save was sent (command and \r as separate writes)
    expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');

    // Allow 500ms for the \r to be sent after the command
    await vi.advanceTimersByTimeAsync(600);

    // /clear and the continuation prompt should NOT have been sent yet (no checkpoint file)
    expect(mockPty.sendText).not.toHaveBeenCalledWith('/clear');
    expect(mockPty.sendText).not.toHaveBeenCalledWith(
      expect.stringContaining('session-checkpoint.md')
    );

    // Advance 2 seconds — still no checkpoint file
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockPty.sendText).not.toHaveBeenCalledWith('/clear');

    // Simulate Claude finishing the save — create checkpoint file
    fs.writeFileSync(
      path.join(specDir, 'session-checkpoint.md'),
      '---\nfeature: test\nstatus: paused\n---\n# Session Checkpoint\n'
    );

    // Advance 1 more second — polling detects the new file
    await vi.advanceTimersByTimeAsync(1100);

    // NOW /clear should have been sent (command and \r as separate writes)
    expect(mockPty.sendText).toHaveBeenCalledWith('/clear');

    // Advance past the 500ms PTY delay + 2-second delay after /clear
    await vi.advanceTimersByTimeAsync(2600);

    expect(mockPty.sendText).toHaveBeenCalledWith(expect.stringContaining('session-checkpoint.md'));
  });

  it('should detect updated checkpoint file (not just new ones)', async () => {
    // Pre-create an existing checkpoint file
    const checkpointPath = path.join(specDir, 'session-checkpoint.md');
    fs.writeFileSync(checkpointPath, '---\nstatus: old\n---\n');

    let utilization = 54000;
    monitor.setContextProvider(() => ({
      breakdown: { conversation: utilization },
      dataSource: 'real' as const,
    }));

    monitor.startMonitoring(30000);

    // Cross threshold
    utilization = 80000;
    monitor.checkHealth();

    expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');
    expect(mockPty.sendText).not.toHaveBeenCalledWith('/clear');

    // Advance past 500ms PTY delay + 2 seconds for polling
    await vi.advanceTimersByTimeAsync(2600);

    // Rewrite the file and force a future mtime so polling detects the change
    // (fake timers don't affect filesystem timestamps, so we set mtime explicitly)
    fs.writeFileSync(checkpointPath, '---\nstatus: paused\nupdated: true\n---\n');
    const futureTime = new Date(Date.now() + 5000);
    fs.utimesSync(checkpointPath, futureTime, futureTime);

    // Advance to let polling detect the update
    await vi.advanceTimersByTimeAsync(1100);

    expect(mockPty.sendText).toHaveBeenCalledWith('/clear');

    // Advance past the 500ms PTY delay + 2-second delay after /clear
    await vi.advanceTimersByTimeAsync(2600);

    expect(mockPty.sendText).toHaveBeenCalledWith(expect.stringContaining('session-checkpoint.md'));
  });

  it('should timeout and still send /clear + continuation prompt after 90 seconds (graceful degradation)', async () => {
    let utilization = 54000;
    monitor.setContextProvider(() => ({
      breakdown: { conversation: utilization },
      dataSource: 'real' as const,
    }));

    monitor.startMonitoring(30000);

    // Cross threshold — auto-save triggers
    utilization = 80000;
    monitor.checkHealth();

    expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');

    // Never create a checkpoint file — simulate save failure/hang
    // Advance past the 90-second timeout (+ 500ms PTY delays)
    await vi.advanceTimersByTimeAsync(91500);

    // Should still send /clear (graceful degradation)
    expect(mockPty.sendText).toHaveBeenCalledWith('/clear');

    // Advance past the 500ms PTY delay + 2-second delay after /clear
    await vi.advanceTimersByTimeAsync(2600);

    expect(mockPty.sendText).toHaveBeenCalledWith(expect.stringContaining('session-checkpoint.md'));
  });

  it('should not trigger on non-real data sources', async () => {
    monitor.setContextProvider(() => ({
      breakdown: { conversation: 80000 }, // 67%
      dataSource: 'estimated' as const,
    }));

    monitor.startMonitoring(30000);
    monitor.checkHealth();

    await vi.advanceTimersByTimeAsync(5000);

    // Should NOT have sent save or resume
    expect(mockPty.sendText).not.toHaveBeenCalled();
  });

  it('should respect cooldown between auto-save triggers', async () => {
    let utilization = 54000;
    monitor.setContextProvider(() => ({
      breakdown: { conversation: utilization },
      dataSource: 'real' as const,
    }));

    monitor.startMonitoring(30000);

    // First trigger at 67%
    utilization = 80000;
    monitor.checkHealth();

    // Create checkpoint so it resolves quickly
    fs.writeFileSync(path.join(specDir, 'session-checkpoint.md'), '---\nstatus: paused\n---\n');
    // Advance enough to complete full save/clear/continue cycle:
    // 500ms PTY delay (save \r) + 1s checkpoint poll + 500ms PTY delay (clear \r)
    // + 2s delay after /clear + 500ms PTY delay (prompt \r) + buffer
    await vi.advanceTimersByTimeAsync(6000);

    expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');
    expect(mockPty.sendText).toHaveBeenCalledWith('/clear');
    expect(mockPty.sendText).toHaveBeenCalledWith(expect.stringContaining('session-checkpoint.md'));

    // Reset mocks and try to trigger again immediately (should be blocked by cooldown)
    mockPty.sendText.mockClear();

    // Force another health check at same level
    // Need a new monitor since the threshold was already crossed
    monitor.dispose();
    const monitor2 = new ContextHealthMonitor({
      autoSaveThreshold: 0.65,
      effectiveContextLimit: 120000,
    });

    const trigger2 = new AutoHandoffTrigger(
      {
        autoExecuteSave: true,
        autoResumeAfterSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 60000, // 60s cooldown
      },
      tmpDir
    );

    trigger2.setClaudeVscodeTerminal(mockPty as unknown as typeof vscode.Terminal.prototype);
    trigger2.connect(monitor2);

    monitor2.setContextProvider(() => ({
      breakdown: { conversation: 80000 },
      dataSource: 'real' as const,
    }));

    // Manually set lastNotificationTime to simulate recent trigger
    (trigger2 as unknown as { lastNotificationTime: number }).lastNotificationTime = Date.now();

    monitor2.startMonitoring(30000);
    monitor2.checkHealth();

    await vi.advanceTimersByTimeAsync(5000);

    // Should be blocked by cooldown
    expect(mockPty.sendText).not.toHaveBeenCalled();

    trigger2.dispose();
    monitor2.dispose();
  });

  it('should handle multiple spec dirs and detect checkpoint in any of them', async () => {
    // Create additional spec dirs
    const specDir2 = path.join(tmpDir, '.specify', 'specs', 'feature-002');
    const specDir3 = path.join(tmpDir, '.specify', 'specs', 'feature-003');
    fs.mkdirSync(specDir2, { recursive: true });
    fs.mkdirSync(specDir3, { recursive: true });

    let utilization = 54000;
    monitor.setContextProvider(() => ({
      breakdown: { conversation: utilization },
      dataSource: 'real' as const,
    }));

    monitor.startMonitoring(30000);

    // Cross threshold
    utilization = 80000;
    monitor.checkHealth();

    expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');

    // Allow 500ms PTY delay for \r
    await vi.advanceTimersByTimeAsync(600);

    // Create checkpoint in a DIFFERENT spec dir (not feature-001)
    fs.writeFileSync(path.join(specDir3, 'session-checkpoint.md'), '---\nstatus: paused\n---\n');

    await vi.advanceTimersByTimeAsync(1100);

    // Should still detect it and send /clear
    expect(mockPty.sendText).toHaveBeenCalledWith('/clear');

    // Advance past the 500ms PTY delay + 2-second delay after /clear
    await vi.advanceTimersByTimeAsync(2600);

    expect(mockPty.sendText).toHaveBeenCalledWith(expect.stringContaining('session-checkpoint.md'));
  });
});
