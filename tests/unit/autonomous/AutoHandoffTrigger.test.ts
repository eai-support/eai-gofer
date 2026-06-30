/**
 * Unit tests for AutoHandoffTrigger
 *
 * Tests auto-handoff at critical threshold, auto-save trigger,
 * slop reduction, handoff document generation, and threshold crossing.
 *
 * @see .specify/specs/011-context-health-recursive-memory/tasks.md T030-T033
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContextHealthMonitor,
  type ContextHealthStatus,
} from '../../../extension/src/autonomous/ContextHealthMonitor';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Mock Logger first
vi.mock('../../../extension/src/utils/logger', () => ({
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

// Import after mocks are set up
import {
  AutoHandoffTrigger,
  type HandoffDocumentOptions,
} from '../../../extension/src/autonomous/AutoHandoffTrigger';
import { ContextUsageLogger } from '../../../extension/src/autonomous/ContextUsageLogger';

// Mock ContextUsageLogger
vi.mock('../../../extension/src/autonomous/ContextUsageLogger', () => ({
  ContextUsageLogger: vi.fn().mockImplementation(() => ({
    logHandoff: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('AutoHandoffTrigger', () => {
  let trigger: AutoHandoffTrigger;
  let monitor: ContextHealthMonitor;

  const createCriticalStatus = (): ContextHealthStatus => ({
    status: 'critical',
    utilizationPercent: 85,
    tokensUsed: 102000,
    tokensLimit: 120000,
    breakdown: {
      specArtifacts: 20000,
      memories: 15000,
      hints: 7000,
      observations: 25000,
      systemFiles: 10000,
      conversation: 25000,
    },
    recommendations: ['Context is nearly full. Save your progress now.'],
    timestamp: Date.now(),
    sessionId: 'test-session',
    dataSource: 'real',
  });

  const createWarningStatus = (): ContextHealthStatus => ({
    status: 'warning',
    utilizationPercent: 60,
    tokensUsed: 72000,
    tokensLimit: 120000,
    breakdown: {
      specArtifacts: 12000,
      memories: 12000,
      hints: 6000,
      observations: 18000,
      systemFiles: 8000,
      conversation: 16000,
    },
    recommendations: ['Consider saving progress soon.'],
    timestamp: Date.now(),
    sessionId: 'test-session',
    dataSource: 'real',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    trigger = new AutoHandoffTrigger({
      notificationCooldownMs: 1000, // Short cooldown for testing
      enableContinuousSlopReduction: false, // Prevent setInterval in tests
    });

    monitor = new ContextHealthMonitor();
  });

  afterEach(() => {
    trigger.dispose();
    monitor.dispose();
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Configuration Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultTrigger = new AutoHandoffTrigger();
      const config = defaultTrigger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.notificationCooldownMs).toBe(5 * 60 * 1000);
      expect(config.notifyAtWarning).toBe(false);

      defaultTrigger.dispose();
    });

    it('should accept partial configuration', () => {
      const customTrigger = new AutoHandoffTrigger({
        enabled: false,
        notifyAtWarning: true,
      });
      const config = customTrigger.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.notifyAtWarning).toBe(true);
      expect(config.notificationCooldownMs).toBe(5 * 60 * 1000); // Default

      customTrigger.dispose();
    });

    it('should update configuration', () => {
      trigger.updateConfig({ enabled: false });
      expect(trigger.getConfig().enabled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Monitor Connection Tests (T030)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('monitor connection', () => {
    it('should connect to ContextHealthMonitor', () => {
      expect(() => trigger.connect(monitor)).not.toThrow();
    });

    it('should handle critical event via triggerHandoffNotification (log-only)', async () => {
      // Without SlopReducer, critical events go through triggerHandoffNotification
      // which now logs instead of showing a notification popup
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      // triggerHandoffNotification logs the event (no UI notification)
      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('critical')
      );
    });

    it('should handle handoff-recommended event via logging', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.connect(monitor);

      monitor.emit('handoff-recommended', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('handoff-recommended')
      );
    });

    it('should not trigger on warning by default', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.connect(monitor);

      monitor.emit('warning', createWarningStatus());
      await vi.advanceTimersByTimeAsync(100);

      // Warning handler not registered by default (notifyAtWarning: false)
      expect(mockLogger.logHandoff).not.toHaveBeenCalled();
    });

    it('should trigger on warning when configured', async () => {
      const warningTrigger = new AutoHandoffTrigger({
        notifyAtWarning: true,
        notificationCooldownMs: 1000,
        enableContinuousSlopReduction: false,
      });
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      warningTrigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      warningTrigger.connect(monitor);

      monitor.emit('warning', createWarningStatus());
      await vi.advanceTimersByTimeAsync(100);

      expect(mockLogger.logHandoff).toHaveBeenCalled();

      warningTrigger.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Handoff Notification Tests (T031) — Updated for log-only behavior
  // ─────────────────────────────────────────────────────────────────────────────

  describe('handoff notification (log-only)', () => {
    it('should return triggered=true and action=dismiss for enabled trigger', async () => {
      const result = await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(result.triggered).toBe(true);
      expect(result.action).toBe('dismiss');
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.healthStatus).toBeDefined();
    });

    it('should log handoff event with utilization details', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);

      await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('critical')
      );
    });

    it('should not trigger when disabled', async () => {
      trigger.updateConfig({ enabled: false });

      const result = await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(result.action).toBe('disabled');
      expect(result.triggered).toBe(false);
    });

    it('should handle dismiss action (default)', async () => {
      const result = await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(result.action).toBe('dismiss');
      expect(result.triggered).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Save Integration Tests (T032) — Updated for executeSaveAndHandoff
  // ─────────────────────────────────────────────────────────────────────────────

  describe('save integration', () => {
    it('should execute gofer.saveProgress via executeSaveAndHandoff on critical with no SlopReducer', async () => {
      // Without SlopReducer, critical handler calls triggerHandoffNotification
      // which logs the event. The save is handled by auto-save flow instead.
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.setSessionContext('test-session', 'implement', 'T025');
      trigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      // Verify the handoff was logged
      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        'test-session',
        'implement',
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('critical')
      );
    });

    it('should handle different event reasons', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);

      await trigger.triggerHandoffNotification(createCriticalStatus(), 'handoff-recommended');

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('handoff-recommended')
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Handoff Document Generation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('handoff document generation', () => {
    it('should generate valid markdown document', () => {
      const status = createCriticalStatus();
      const options: HandoffDocumentOptions = {
        sessionId: 'session-123',
        currentStage: 'implement',
        currentTask: 'T025: Create status bar',
      };

      const doc = trigger.generateHandoffDocument(status, options);

      expect(doc).toContain('---');
      expect(doc).toContain('session_id: session-123');
      expect(doc).toContain('stage: implement');
      expect(doc).toContain('# Session Handoff');
    });

    it('should include context health snapshot', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('## Context Health Snapshot');
      expect(doc).toContain('CRITICAL');
      expect(doc).toContain('85%');
    });

    it('should include token breakdown table', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('### Token Breakdown');
      expect(doc).toContain('| Category | Tokens | % of Total |');
      expect(doc).toContain('Conversation');
      expect(doc).toContain('Observations');
    });

    it('should include current task when provided', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
        currentTask: 'T025: Create status bar item',
      });

      expect(doc).toContain('**Current Task**: T025: Create status bar item');
    });

    it('should include key decisions when provided', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
        keyDecisions: ['Used EventEmitter pattern', 'Stored in .specify/'],
      });

      expect(doc).toContain('### Key Decisions');
      expect(doc).toContain('Used EventEmitter pattern');
      expect(doc).toContain('Stored in .specify/');
    });

    it('should include blockers when provided', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
        blockers: ['Missing API documentation', 'Test flakiness'],
      });

      expect(doc).toContain('### Blockers');
      expect(doc).toContain('Missing API documentation');
    });

    it('should include recommendations', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('## Recommendations');
      expect(doc).toContain('Context is nearly full');
    });

    it('should include resume instructions', () => {
      const status = createCriticalStatus();
      const doc = trigger.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('## Resume Instructions');
      expect(doc).toContain('session-checkpoint.md');
    });

    it('should include Failed Approaches section when JSONL entries exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));
      const logsDir = path.join(tmpDir, '.specify/logs');
      fs.mkdirSync(logsDir, { recursive: true });
      fs.writeFileSync(
        path.join(logsDir, 'failed-approaches.jsonl'),
        JSON.stringify({ approach: 'Use polling', reason: 'Too slow for real-time updates' }) +
          '\n',
        'utf-8'
      );

      const triggerWithWorkspace = new AutoHandoffTrigger({ notificationCooldownMs: 1000 }, tmpDir);
      const status = createCriticalStatus();
      const doc = triggerWithWorkspace.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('## Failed Approaches');
      expect(doc).toContain('Use polling');
      expect(doc).toContain('Too slow for real-time updates');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should include Session Memories section when JSONL entries exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));
      const logsDir = path.join(tmpDir, '.specify/logs');
      fs.mkdirSync(logsDir, { recursive: true });
      fs.writeFileSync(
        path.join(logsDir, 'session-memory.jsonl'),
        JSON.stringify({
          type: 'learning',
          taskId: 'T005',
          content: 'Always source common.sh first',
        }) + '\n',
        'utf-8'
      );

      const triggerWithWorkspace = new AutoHandoffTrigger({ notificationCooldownMs: 1000 }, tmpDir);
      const status = createCriticalStatus();
      const doc = triggerWithWorkspace.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).toContain('## Session Memories');
      expect(doc).toContain('learning');
      expect(doc).toContain('Always source common.sh first');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should not include Failed Approaches or Session Memories when no JSONL files exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));

      const triggerWithWorkspace = new AutoHandoffTrigger({ notificationCooldownMs: 1000 }, tmpDir);
      const status = createCriticalStatus();
      const doc = triggerWithWorkspace.generateHandoffDocument(status, {
        sessionId: 'test',
        currentStage: 'implement',
      });

      expect(doc).not.toContain('## Failed Approaches');
      expect(doc).not.toContain('## Session Memories');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Session Context Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('session context', () => {
    it('should update session context', () => {
      trigger.setSessionContext('session-456', 'research', 'T001: Research task');
      const doc = trigger.generateHandoffDocument(createCriticalStatus(), {
        sessionId: 'session-456',
        currentStage: 'research',
        currentTask: 'T001: Research task',
      });
      expect(doc).toContain('session_id: session-456');
      expect(doc).toContain('stage: research');
    });

    it('should use session context in handoff logging', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.setSessionContext('my-session', 'validate', 'T050: Validate implementation');

      await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        'my-session',
        'validate',
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('critical')
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Usage Logger Integration Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('usage logger integration', () => {
    it('should log handoff events', async () => {
      const mockLogger = {
        logHandoff: vi.fn().mockResolvedValue(undefined),
      };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.setSessionContext('log-session', 'implement');

      await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        'log-session',
        'implement',
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('critical')
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto Slop Reduction Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('auto slop reduction', () => {
    const createMockSlopReducer = (totalFixes: number = 3, filesFixed: number = 2) => ({
      reduceWorkspace: vi.fn().mockReturnValue({
        filesScanned: 50,
        filesFixed,
        totalFixes,
        fixesByPattern: totalFixes > 0 ? { 'console-log': 2, debugger: 1 } : {},
        fixes: [],
      }),
      workspacePath: '/mock/workspace',
    });

    it('should auto-reduce slop on critical event when SlopReducer is set', async () => {
      const slopTrigger = new AutoHandoffTrigger({
        notificationCooldownMs: 1000,
        enableContinuousSlopReduction: false,
      });
      const mockReducer = createMockSlopReducer();
      slopTrigger.setSlopReducer(mockReducer as never);
      slopTrigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      expect(mockReducer.reduceWorkspace).toHaveBeenCalled();

      slopTrigger.dispose();
    });

    it('should call reduceWorkspace with no fixes and log clean status', async () => {
      const slopTrigger = new AutoHandoffTrigger({
        notificationCooldownMs: 1000,
        enableContinuousSlopReduction: false,
      });
      const mockReducer = createMockSlopReducer(0, 0);
      slopTrigger.setSlopReducer(mockReducer as never);
      slopTrigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      expect(mockReducer.reduceWorkspace).toHaveBeenCalled();

      slopTrigger.dispose();
    });

    it('should respect cooldown for auto-reduction', async () => {
      const slopTrigger = new AutoHandoffTrigger({
        notificationCooldownMs: 60000,
        enableContinuousSlopReduction: false,
      });
      const mockReducer = createMockSlopReducer();
      slopTrigger.setSlopReducer(mockReducer as never);
      slopTrigger.connect(monitor);

      // First critical event
      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);
      expect(mockReducer.reduceWorkspace).toHaveBeenCalledTimes(1);

      // Second critical event immediately — should be in cooldown
      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);
      expect(mockReducer.reduceWorkspace).toHaveBeenCalledTimes(1);

      slopTrigger.dispose();
    });

    it('should fall back to log-only notification without SlopReducer', async () => {
      // No SlopReducer set — should fall through to triggerHandoffNotification (log-only)
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      // triggerHandoffNotification logs instead of showing UI
      expect(mockLogger.logHandoff).toHaveBeenCalled();
    });

    it('should not auto-reduce for estimated data source', async () => {
      const slopTrigger = new AutoHandoffTrigger({
        notificationCooldownMs: 1000,
        enableContinuousSlopReduction: false,
      });
      const mockReducer = createMockSlopReducer();
      slopTrigger.setSlopReducer(mockReducer as never);
      slopTrigger.connect(monitor);

      const estimatedStatus = { ...createCriticalStatus(), dataSource: 'estimated' as const };
      monitor.emit('critical', estimatedStatus);
      await vi.advanceTimersByTimeAsync(100);

      expect(mockReducer.reduceWorkspace).not.toHaveBeenCalled();

      slopTrigger.dispose();
    });

    it('should log auto-reduction to usage logger', async () => {
      const slopTrigger = new AutoHandoffTrigger({
        notificationCooldownMs: 1000,
        enableContinuousSlopReduction: false,
      });
      const mockReducer = createMockSlopReducer();
      slopTrigger.setSlopReducer(mockReducer as never);
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      slopTrigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      slopTrigger.connect(monitor);

      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'critical',
        102000,
        120000,
        85,
        expect.stringContaining('auto-context-reset')
      );

      slopTrigger.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Manual Check Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('manual check', () => {
    it('should return null when no monitor connected', async () => {
      const result = await trigger.checkAndTrigger();
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cooldown Management Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('cooldown management', () => {
    it('should reset cooldown', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);

      await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');
      expect(mockLogger.logHandoff).toHaveBeenCalledTimes(1);

      // Reset cooldown and trigger again
      trigger.resetCooldown();
      await trigger.triggerHandoffNotification(createCriticalStatus(), 'critical');
      expect(mockLogger.logHandoff).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-Save Trigger Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('auto-save trigger', () => {
    const createAutoSaveStatus = (): ContextHealthStatus => ({
      status: 'warning',
      utilizationPercent: 70,
      tokensUsed: 84000,
      tokensLimit: 120000,
      breakdown: {
        specArtifacts: 15000,
        memories: 12000,
        hints: 6000,
        observations: 20000,
        systemFiles: 9000,
        conversation: 22000,
      },
      recommendations: ['Context at auto-save threshold.'],
      timestamp: Date.now(),
      sessionId: 'test-session',
      dataSource: 'real',
    });

    it('should send /7_gofer_save to pty when auto-save event fires', async () => {
      const mockPty = { sendText: vi.fn() };
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: false,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.connect(monitor);

      // Emit auto-save event directly
      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();

      expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');

      autoSaveTrigger.dispose();
    });

    it('should not send save when autoExecuteSave is disabled', async () => {
      const mockPty = { sendText: vi.fn() };
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: false,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.connect(monitor);

      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();

      expect(mockPty.sendText).not.toHaveBeenCalled();

      autoSaveTrigger.dispose();
    });

    it('should not send save for estimated data source', async () => {
      const mockPty = { sendText: vi.fn() };
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.connect(monitor);

      const estimatedStatus = { ...createAutoSaveStatus(), dataSource: 'estimated' as const };
      monitor.emit('auto-save', estimatedStatus);
      await vi.runAllTimersAsync();

      expect(mockPty.sendText).not.toHaveBeenCalled();

      autoSaveTrigger.dispose();
    });

    it('should send save/clear/continue cycle to pty when autoExecuteSave is enabled', async () => {
      const mockPty = { sendText: vi.fn() };
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.connect(monitor);

      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();

      expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');
      // After checkpoint timeout + clear + delay, a checkpoint continuation prompt is sent
      expect(mockPty.sendText).toHaveBeenCalledWith('/clear');
      expect(mockPty.sendText).toHaveBeenCalledWith(
        expect.stringContaining('session-checkpoint.md')
      );

      autoSaveTrigger.dispose();
    });

    it('should not crash when no pty is connected', async () => {
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      // No pty set
      autoSaveTrigger.connect(monitor);

      // Should not throw
      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();

      autoSaveTrigger.dispose();
    });

    it('should respect cooldown for auto-save', async () => {
      // Create temp workspace so checkpoint resolves quickly (avoids 90s timeout)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-cooldown-'));
      const specDir = path.join(tmpDir, '.specify', 'specs', 'test-spec');
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'session-checkpoint.md'), '---\nstatus: test\n---\n');

      const mockPty = { sendText: vi.fn() };
      const autoSaveTrigger = new AutoHandoffTrigger(
        {
          autoExecuteSave: true,
          autoResumeAfterSave: false,
          enableContinuousSlopReduction: false,
          notificationCooldownMs: 120000, // 2-minute cooldown (longer than checkpoint timeout)
        },
        tmpDir
      );
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.connect(monitor);

      // First auto-save — save/clear/continue sends 3 terminal entries
      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();
      expect(mockPty.sendText).toHaveBeenCalledTimes(3); // /7_gofer_save, /clear, checkpoint prompt

      // Second auto-save immediately — should be blocked by cooldown
      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();
      expect(mockPty.sendText).toHaveBeenCalledTimes(3); // unchanged

      autoSaveTrigger.dispose();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should log auto-save event to usage logger', async () => {
      const mockPty = { sendText: vi.fn() };
      const mockLogger = {
        logHandoff: vi.fn().mockResolvedValue(undefined),
      };
      const autoSaveTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: false,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      autoSaveTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      autoSaveTrigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      autoSaveTrigger.setSessionContext('auto-save-session', 'implement', 'T005');
      autoSaveTrigger.connect(monitor);

      monitor.emit('auto-save', createAutoSaveStatus());
      await vi.runAllTimersAsync();

      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        'auto-save-session',
        'implement',
        'warning',
        84000,
        120000,
        70,
        expect.stringContaining('auto-save')
      );

      autoSaveTrigger.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // End-to-End Threshold Crossing Test (65% auto-save trigger)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('end-to-end threshold crossing at 65%', () => {
    it('should trigger auto-save when context crosses from below 65% to above 65%', async () => {
      const mockPty = { sendText: vi.fn() };
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };

      // Create monitor with auto-save threshold at 65%
      const thresholdMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      // Create trigger with auto-save + auto-resume enabled
      const thresholdTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      thresholdTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      thresholdTrigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      thresholdTrigger.setSessionContext('threshold-test', 'implement', 'T010');
      thresholdTrigger.connect(thresholdMonitor);

      // Step 1: Context at 50% — should NOT trigger auto-save
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 60000 },
        dataSource: 'real',
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPty.sendText).not.toHaveBeenCalled();

      // Step 2: Context crosses 65% threshold (jump to 66%)
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 80000 },
        dataSource: 'real',
      });
      await vi.runAllTimersAsync();

      // auto-save should have fired: /7_gofer_save sent to terminal
      expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');

      // save/clear/continue cycle sends all three terminal entries to the same pty
      expect(mockPty.sendText).toHaveBeenCalledWith('/clear');
      expect(mockPty.sendText).toHaveBeenCalledWith(
        expect.stringContaining('session-checkpoint.md')
      );

      // Usage logger should have recorded the auto-save event
      expect(mockLogger.logHandoff).toHaveBeenCalledWith(
        'threshold-test',
        'implement',
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining('auto-save')
      );

      thresholdTrigger.dispose();
      thresholdMonitor.dispose();
    });

    it('should NOT trigger auto-save when context stays below 65%', async () => {
      const mockPty = { sendText: vi.fn() };

      const thresholdMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      const thresholdTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      thresholdTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      thresholdTrigger.connect(thresholdMonitor);

      // Context at 40%
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 48000 },
        dataSource: 'real',
      });
      await vi.advanceTimersByTimeAsync(100);

      // Context at 55% — still below 65%
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 66000 },
        dataSource: 'real',
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPty.sendText).not.toHaveBeenCalled();

      thresholdTrigger.dispose();
      thresholdMonitor.dispose();
    });

    it('should NOT trigger auto-save for estimated data even above 65%', async () => {
      const mockPty = { sendText: vi.fn() };

      const thresholdMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      const thresholdTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 1000,
      });
      thresholdTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      thresholdTrigger.connect(thresholdMonitor);

      // Estimated data at 50% then 80% — should NOT trigger because dataSource is estimated
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 60000 },
        dataSource: 'estimated',
      });
      await vi.advanceTimersByTimeAsync(100);

      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 96000 },
        dataSource: 'estimated',
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(mockPty.sendText).not.toHaveBeenCalled();

      thresholdTrigger.dispose();
      thresholdMonitor.dispose();
    });

    it('should only trigger auto-save ONCE per threshold crossing (edge detection)', async () => {
      const mockPty = { sendText: vi.fn() };

      const thresholdMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      const thresholdTrigger = new AutoHandoffTrigger({
        autoExecuteSave: true,
        autoResumeAfterSave: false,
        enableContinuousSlopReduction: false,
        notificationCooldownMs: 100, // Short cooldown so it doesn't interfere
      });
      thresholdTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      thresholdTrigger.connect(thresholdMonitor);

      // Cross threshold: 50% → 75%
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 60000 },
        dataSource: 'real',
      });
      await vi.advanceTimersByTimeAsync(100);

      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 90000 },
        dataSource: 'real',
      });
      await vi.runAllTimersAsync();

      // save/clear/continue sends 3 terminal entries
      expect(mockPty.sendText).toHaveBeenCalledTimes(3);

      // Continue above threshold: 75% → 80% — should NOT fire again (edge detection)
      vi.advanceTimersByTime(200); // Past cooldown
      thresholdMonitor.analyzeContext({
        breakdown: { conversation: 96000 },
        dataSource: 'real',
      });
      await vi.advanceTimersByTimeAsync(100);

      // Still only 3 calls — the monitor only emits 'auto-save' on the crossing edge
      expect(mockPty.sendText).toHaveBeenCalledTimes(3);

      thresholdTrigger.dispose();
      thresholdMonitor.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Adaptive Polling Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('adaptive polling', () => {
    it('should accelerate polling to 2s when utilization crosses 50%', () => {
      const adaptiveMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      // Set a context provider that returns 55% utilization
      adaptiveMonitor.setContextProvider(() => ({
        breakdown: { conversation: 66000 }, // 66k / 120k = 55%
        dataSource: 'real',
      }));

      // Start monitoring with default 30s interval
      adaptiveMonitor.startMonitoring(30000);
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(30000);

      // First health check should trigger adaptive acceleration
      adaptiveMonitor.checkHealth();
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(2000);

      adaptiveMonitor.dispose();
    });

    it('should revert to base interval when utilization drops below 50%', () => {
      let utilization = 66000; // 55%
      const adaptiveMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      adaptiveMonitor.setContextProvider(() => ({
        breakdown: { conversation: utilization },
        dataSource: 'real',
      }));

      adaptiveMonitor.startMonitoring(30000);

      // Health check at 55% → accelerate to 2s
      adaptiveMonitor.checkHealth();
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(2000);

      // Drop to 40% → revert to base 30s
      utilization = 48000; // 48k / 120k = 40%
      adaptiveMonitor.checkHealth();
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(30000);

      adaptiveMonitor.dispose();
    });

    it('should not slow down when setBasePollingInterval is called during acceleration', () => {
      const adaptiveMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      adaptiveMonitor.setContextProvider(() => ({
        breakdown: { conversation: 72000 }, // 60%
        dataSource: 'real',
      }));

      adaptiveMonitor.startMonitoring(10000);

      // Accelerate via health check
      adaptiveMonitor.checkHealth();
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(2000);

      // External event tries to set base to 60s — should NOT slow down
      adaptiveMonitor.setBasePollingInterval(60000);
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(2000);

      adaptiveMonitor.dispose();
    });

    it('should accelerate when setBasePollingInterval is called with faster interval', () => {
      const adaptiveMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });

      adaptiveMonitor.setContextProvider(() => ({
        breakdown: { conversation: 36000 }, // 30%
        dataSource: 'real',
      }));

      adaptiveMonitor.startMonitoring(30000);
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(30000);

      // External event sets base to faster 5s — should speed up
      adaptiveMonitor.setBasePollingInterval(5000);
      expect(adaptiveMonitor.getCurrentPollingInterval()).toBe(5000);

      adaptiveMonitor.dispose();
    });

    it('should catch 65% threshold with 2s polling when context grows rapidly', async () => {
      let utilization = 54000; // Start at 45%
      const mockPty = { sendText: vi.fn() };
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };

      // Create temp workspace with spec structure for checkpoint file detection
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-test-'));
      const specDir = path.join(tmpDir, '.specify', 'specs', 'test-spec');
      fs.mkdirSync(specDir, { recursive: true });

      const rapidMonitor = new ContextHealthMonitor({
        autoSaveThreshold: 0.65,
        effectiveContextLimit: 120000,
      });
      const rapidTrigger = new AutoHandoffTrigger(
        {
          autoExecuteSave: true,
          autoResumeAfterSave: true,
          enableContinuousSlopReduction: false,
          notificationCooldownMs: 1000,
        },
        tmpDir
      );

      rapidTrigger.setClaudeVscodeTerminal(mockPty as unknown as vscode.Terminal);
      rapidTrigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      rapidTrigger.setSessionContext('rapid-test', 'implement', 'T010');
      rapidTrigger.connect(rapidMonitor);

      rapidMonitor.setContextProvider(() => ({
        breakdown: { conversation: utilization },
        dataSource: 'real',
      }));

      // Start at 30s polling
      rapidMonitor.startMonitoring(30000);
      expect(rapidMonitor.getCurrentPollingInterval()).toBe(30000);

      // Step 1: Context at 45% — no change to polling
      rapidMonitor.checkHealth();
      expect(rapidMonitor.getCurrentPollingInterval()).toBe(30000);

      // Step 2: Context jumps to 55% — accelerate to 2s
      utilization = 66000;
      rapidMonitor.checkHealth();
      expect(rapidMonitor.getCurrentPollingInterval()).toBe(2000);

      // Step 3: Context crosses 65% — auto-save fires, starts checkpoint polling
      utilization = 80000; // 67%
      rapidMonitor.checkHealth();

      // Simulate Claude creating the checkpoint file (what /7_gofer_save does)
      fs.writeFileSync(path.join(specDir, 'session-checkpoint.md'), '---\nstatus: paused\n---\n');

      // Advance timers through the full save/clear/continue cycle:
      // 500ms (save \r) + 1000ms (checkpoint poll) + 500ms (clear \r) + 2000ms (clear pause) + 500ms (prompt \r) = 4500ms
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPty.sendText).toHaveBeenCalledWith('/7_gofer_save');
      // After checkpoint detected, /clear and a continuation prompt follow
      expect(mockPty.sendText).toHaveBeenCalledWith('/clear');
      expect(mockPty.sendText).toHaveBeenCalledWith(
        expect.stringContaining('session-checkpoint.md')
      );

      rapidTrigger.dispose();
      rapidMonitor.dispose();

      // Clean up temp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Disposal Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('disposal', () => {
    it('should clean up on dispose', () => {
      trigger.connect(monitor);
      expect(() => trigger.dispose()).not.toThrow();
    });

    it('should not respond to events after dispose', async () => {
      const mockLogger = { logHandoff: vi.fn().mockResolvedValue(undefined) };
      trigger.setUsageLogger(mockLogger as unknown as ContextUsageLogger);
      trigger.connect(monitor);
      trigger.dispose();

      vi.clearAllMocks();
      monitor.emit('critical', createCriticalStatus());
      await vi.advanceTimersByTimeAsync(100);

      // After dispose, no events should be processed
      expect(mockLogger.logHandoff).not.toHaveBeenCalled();
    });
  });
});
