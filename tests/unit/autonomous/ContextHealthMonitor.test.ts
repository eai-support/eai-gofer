/**
 * Unit tests for ContextHealthMonitor
 *
 * Tests context analysis, threshold detection, event emission,
 * periodic monitoring, and recommendations generation.
 *
 * @see .specify/specs/011-context-health-recursive-memory/tasks.md T020
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContextHealthMonitor,
  type ContextAnalysisInput,
} from '../../../extension/src/autonomous/ContextHealthMonitor';

// Mock the Logger
vi.mock('../../../extension/src/utils/logger', () => ({
  Logger: {
    for: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('ContextHealthMonitor', () => {
  let monitor: ContextHealthMonitor;

  beforeEach(() => {
    monitor = new ContextHealthMonitor();
  });

  afterEach(() => {
    monitor.dispose();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Token Estimation Tests (T017)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count (4 chars ≈ 1 token)', () => {
      expect(monitor.estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25 → 2
      expect(monitor.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
      expect(monitor.estimateTokens('a'.repeat(100))).toBe(25); // 100 / 4 = 25
    });

    it('should return 0 for empty content', () => {
      expect(monitor.estimateTokens('')).toBe(0);
    });

    it('should handle null/undefined content', () => {
      expect(monitor.estimateTokens(null as unknown as string)).toBe(0);
      expect(monitor.estimateTokens(undefined as unknown as string)).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Analysis Tests (T016)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('analyzeContext', () => {
    it('should return healthy status for low utilization', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          specArtifacts: 10000,
          memories: 5000,
          hints: 2000,
          observations: 3000,
          systemFiles: 5000,
          conversation: 15000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.status).toBe('healthy');
      expect(status.tokensUsed).toBe(40000);
      expect(status.utilizationPercent).toBeCloseTo(33.33, 1);
    });

    it('should return warning status between 50-70%', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          specArtifacts: 20000,
          memories: 15000,
          hints: 5000,
          observations: 10000,
          systemFiles: 5000,
          conversation: 20000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.status).toBe('warning');
      expect(status.tokensUsed).toBe(75000);
      expect(status.utilizationPercent).toBe(62.5);
    });

    it('should return critical status above 70%', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          specArtifacts: 25000,
          memories: 20000,
          hints: 10000,
          observations: 15000,
          systemFiles: 10000,
          conversation: 30000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.status).toBe('critical');
      expect(status.tokensUsed).toBe(110000);
      expect(status.utilizationPercent).toBeCloseTo(91.67, 1);
    });

    it('should handle partial breakdown input', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          conversation: 30000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.breakdown.conversation).toBe(30000);
      expect(status.breakdown.specArtifacts).toBe(0);
      expect(status.breakdown.memories).toBe(0);
      expect(status.tokensUsed).toBe(30000);
    });

    it('should include session ID if provided', () => {
      const input: ContextAnalysisInput = {
        breakdown: { conversation: 10000 },
        sessionId: 'test-session-123',
      };

      const status = monitor.analyzeContext(input);

      expect(status.sessionId).toBe('test-session-123');
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const status = monitor.analyzeContext({ breakdown: {} });
      const after = Date.now();

      expect(status.timestamp).toBeGreaterThanOrEqual(before);
      expect(status.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Recommendations Tests (T018)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('recommendations', () => {
    it('should provide healthy recommendation when status is healthy', () => {
      const input: ContextAnalysisInput = {
        breakdown: { conversation: 10000 },
      };

      const status = monitor.analyzeContext(input);

      expect(status.recommendations).toContain(
        'Context usage is healthy. Continue working normally.'
      );
    });

    it('should recommend handoff save at critical level', () => {
      const input: ContextAnalysisInput = {
        breakdown: { conversation: 100000 },
      };

      const status = monitor.analyzeContext(input);

      expect(status.recommendations.some((r) => r.includes('/7_gofer_save'))).toBe(true);
    });

    it('should recommend masking when observations are large', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          observations: 50000,
          conversation: 30000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.recommendations.some((r) => r.includes('observation'))).toBe(true);
    });

    it('should recommend new session when conversation is long', () => {
      const input: ContextAnalysisInput = {
        breakdown: {
          conversation: 70000,
          specArtifacts: 10000,
        },
      };

      const status = monitor.analyzeContext(input);

      expect(status.recommendations.some((r) => r.includes('session-checkpoint.md'))).toBe(true);
    });

    it('should include stage-specific recommendations', () => {
      const researchInput: ContextAnalysisInput = {
        breakdown: { conversation: 70000 },
        stage: 'research',
      };

      const status = monitor.analyzeContext(researchInput);

      expect(status.recommendations.some((r) => r.includes('research'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Threshold Tests (T018)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('thresholds', () => {
    it('should use custom warning threshold', () => {
      const customMonitor = new ContextHealthMonitor({
        warningThreshold: 0.3, // 30%
      });

      const status = customMonitor.analyzeContext({
        breakdown: { conversation: 40000 }, // 33.3%
      });

      expect(status.status).toBe('warning');
      customMonitor.dispose();
    });

    it('should use custom critical threshold', () => {
      const customMonitor = new ContextHealthMonitor({
        criticalThreshold: 0.5, // 50%
      });

      const status = customMonitor.analyzeContext({
        breakdown: { conversation: 65000 }, // 54.2%
      });

      expect(status.status).toBe('critical');
      customMonitor.dispose();
    });

    it('should use custom effective context limit', () => {
      const customMonitor = new ContextHealthMonitor({
        effectiveContextLimit: 200000,
      });

      const status = customMonitor.analyzeContext({
        breakdown: { conversation: 120000 }, // 60%
      });

      expect(status.status).toBe('warning'); // 60% > 50% warning
      expect(status.tokensLimit).toBe(200000);
      customMonitor.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission Tests (T019)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('event emission', () => {
    it('should emit healthy event when status is healthy', () => {
      const healthyHandler = vi.fn();
      monitor.on('healthy', healthyHandler);

      monitor.analyzeContext({ breakdown: { conversation: 10000 } });

      expect(healthyHandler).toHaveBeenCalledTimes(1);
      expect(healthyHandler.mock.calls[0][0].status).toBe('healthy');
    });

    it('should emit warning event when status is warning', () => {
      const warningHandler = vi.fn();
      monitor.on('warning', warningHandler);

      monitor.analyzeContext({ breakdown: { conversation: 70000 } });

      expect(warningHandler).toHaveBeenCalledTimes(1);
      expect(warningHandler.mock.calls[0][0].status).toBe('warning');
    });

    it('should emit critical event when status is critical', () => {
      const criticalHandler = vi.fn();
      monitor.on('critical', criticalHandler);

      monitor.analyzeContext({ breakdown: { conversation: 100000 } });

      expect(criticalHandler).toHaveBeenCalledTimes(1);
      expect(criticalHandler.mock.calls[0][0].status).toBe('critical');
    });

    it('should emit status-change event on transition', () => {
      const changeHandler = vi.fn();
      monitor.on('status-change', changeHandler);

      // Start healthy
      monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      expect(changeHandler).not.toHaveBeenCalled(); // No change from initial

      // Transition to warning
      monitor.analyzeContext({ breakdown: { conversation: 70000 } });
      expect(changeHandler).toHaveBeenCalledTimes(1);
      expect(changeHandler.mock.calls[0][0]).toBe('healthy');
      expect(changeHandler.mock.calls[0][1]).toBe('warning');
    });

    it('should emit handoff-recommended when entering critical with real data', () => {
      const handoffHandler = vi.fn();
      monitor.on('handoff-recommended', handoffHandler);

      // Start healthy
      monitor.analyzeContext({ breakdown: { conversation: 10000 }, dataSource: 'real' });
      // Transition to critical
      monitor.analyzeContext({ breakdown: { conversation: 100000 }, dataSource: 'real' });

      expect(handoffHandler).toHaveBeenCalledTimes(1);
    });

    it('should not emit handoff-recommended for estimated data', () => {
      const handoffHandler = vi.fn();
      monitor.on('handoff-recommended', handoffHandler);

      monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      monitor.analyzeContext({ breakdown: { conversation: 100000 }, dataSource: 'estimated' });

      expect(handoffHandler).not.toHaveBeenCalled();
    });

    it('should not emit handoff-recommended if autoHandoffEnabled is false', () => {
      const customMonitor = new ContextHealthMonitor({
        autoHandoffEnabled: false,
      });
      const handoffHandler = vi.fn();
      customMonitor.on('handoff-recommended', handoffHandler);

      customMonitor.analyzeContext({ breakdown: { conversation: 10000 }, dataSource: 'real' });
      customMonitor.analyzeContext({ breakdown: { conversation: 100000 }, dataSource: 'real' });

      expect(handoffHandler).not.toHaveBeenCalled();
      customMonitor.dispose();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Periodic Monitoring Tests (T019)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('periodic monitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start monitoring with interval', () => {
      let callCount = 0;
      monitor.setContextProvider(() => {
        callCount++;
        return { breakdown: { conversation: 10000 } };
      });

      monitor.startMonitoring(1000);

      expect(monitor.isMonitoring()).toBe(true);

      vi.advanceTimersByTime(3000);

      expect(callCount).toBe(3);
    });

    it('should stop monitoring', () => {
      let callCount = 0;
      monitor.setContextProvider(() => {
        callCount++;
        return { breakdown: { conversation: 10000 } };
      });

      monitor.startMonitoring(1000);
      vi.advanceTimersByTime(2000);
      expect(callCount).toBe(2);

      monitor.stopMonitoring();
      expect(monitor.isMonitoring()).toBe(false);

      vi.advanceTimersByTime(3000);
      expect(callCount).toBe(2); // No additional calls
    });

    it('should use config interval by default', () => {
      const customMonitor = new ContextHealthMonitor({
        checkIntervalMs: 2000,
      });
      let callCount = 0;
      customMonitor.setContextProvider(() => {
        callCount++;
        return { breakdown: { conversation: 10000 } };
      });

      customMonitor.startMonitoring();

      vi.advanceTimersByTime(4000);

      expect(callCount).toBe(2); // 2 intervals at 2000ms each
      customMonitor.dispose();
    });

    it('should return null from checkHealth if no provider set', () => {
      const status = monitor.checkHealth();
      expect(status).toBeNull();
    });

    it('should return status from checkHealth with provider', () => {
      monitor.setContextProvider(() => ({
        breakdown: { conversation: 50000 },
      }));

      const status = monitor.checkHealth();

      expect(status).not.toBeNull();
      expect(status!.tokensUsed).toBe(50000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Status History Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('status history', () => {
    it('should track status history', () => {
      monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      monitor.analyzeContext({ breakdown: { conversation: 70000 } });
      monitor.analyzeContext({ breakdown: { conversation: 100000 } });

      const history = monitor.getStatusHistory();

      expect(history.length).toBe(3);
      expect(history[0].status).toBe('critical'); // Most recent first
      expect(history[1].status).toBe('warning');
      expect(history[2].status).toBe('healthy');
    });

    it('should limit history with parameter', () => {
      for (let i = 0; i < 10; i++) {
        monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      }

      const history = monitor.getStatusHistory(3);

      expect(history.length).toBe(3);
    });

    it('should return last status', () => {
      monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      monitor.analyzeContext({ breakdown: { conversation: 70000 } });

      const last = monitor.getLastStatus();

      expect(last).not.toBeNull();
      expect(last!.status).toBe('warning');
    });

    it('should return null for last status when no history', () => {
      expect(monitor.getLastStatus()).toBeNull();
    });

    it('should clear history', () => {
      monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      monitor.analyzeContext({ breakdown: { conversation: 70000 } });

      monitor.clearHistory();

      expect(monitor.getStatusHistory().length).toBe(0);
      expect(monitor.getLastStatus()).toBeNull();
    });

    it('should limit history to 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        monitor.analyzeContext({ breakdown: { conversation: 10000 } });
      }

      expect(monitor.getStatusHistory().length).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Configuration Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('configuration', () => {
    it('should use default config values', () => {
      const config = monitor.getConfig();

      expect(config.warningThreshold).toBe(0.5);
      expect(config.criticalThreshold).toBe(0.7);
      expect(config.effectiveContextLimit).toBe(120000);
      expect(config.checkIntervalMs).toBe(5000);
      expect(config.autoHandoffEnabled).toBe(true);
      expect(config.logToJsonl).toBe(true);
    });

    it('should accept partial config in constructor', () => {
      const customMonitor = new ContextHealthMonitor({
        warningThreshold: 0.4,
        criticalThreshold: 0.6,
      });

      const config = customMonitor.getConfig();

      expect(config.warningThreshold).toBe(0.4);
      expect(config.criticalThreshold).toBe(0.6);
      expect(config.effectiveContextLimit).toBe(120000); // Default
      customMonitor.dispose();
    });

    it('should update config dynamically', () => {
      monitor.updateConfig({ warningThreshold: 0.35 });

      const config = monitor.getConfig();
      expect(config.warningThreshold).toBe(0.35);
    });

    it('should restart monitoring when interval changes', () => {
      vi.useFakeTimers();

      let callCount = 0;
      monitor.setContextProvider(() => {
        callCount++;
        return { breakdown: { conversation: 10000 } };
      });

      monitor.startMonitoring(1000);
      vi.advanceTimersByTime(2000);
      expect(callCount).toBe(2);

      // Update interval - should restart
      monitor.updateConfig({ checkIntervalMs: 500 });

      vi.advanceTimersByTime(1500);
      expect(callCount).toBe(5); // 3 more at 500ms interval

      vi.useRealTimers();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Dispose Tests
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // T025: Dynamic Context Limits (Spec 014 Phase 3)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('dynamic context limits (T025)', () => {
    it('should update effective context limit via setEffectiveContextLimit', () => {
      monitor.setEffectiveContextLimit(200000);
      const config = monitor.getConfig();
      expect(config.effectiveContextLimit).toBe(200000);
    });

    it('should not update limit with zero or negative value', () => {
      const originalLimit = monitor.getConfig().effectiveContextLimit;
      monitor.setEffectiveContextLimit(0);
      expect(monitor.getConfig().effectiveContextLimit).toBe(originalLimit);

      monitor.setEffectiveContextLimit(-1);
      expect(monitor.getConfig().effectiveContextLimit).toBe(originalLimit);
    });

    it('should not update when limit is same as current', () => {
      const original = monitor.getConfig().effectiveContextLimit;
      monitor.setEffectiveContextLimit(original);
      // Should be a no-op
      expect(monitor.getConfig().effectiveContextLimit).toBe(original);
    });

    it('should affect utilization calculation after limit change', () => {
      // With default 120k limit, 60k tokens = 50% utilization
      const statusBefore = monitor.analyzeContext({
        breakdown: { conversation: 60000 },
      });
      expect(statusBefore.utilizationPercent).toBe(50);

      // Change to 200k limit — same 60k tokens = 30% utilization
      monitor.setEffectiveContextLimit(200000);
      const statusAfter = monitor.analyzeContext({
        breakdown: { conversation: 60000 },
      });
      expect(statusAfter.utilizationPercent).toBe(30);
    });

    it('should update health status when limit changes', () => {
      // 85k out of 120k = 70.8% = critical
      const criticalStatus = monitor.analyzeContext({
        breakdown: { conversation: 85000 },
      });
      expect(criticalStatus.status).toBe('critical');

      // Change limit to 200k — 85k out of 200k = 42.5% = healthy
      monitor.setEffectiveContextLimit(200000);
      const healthyStatus = monitor.analyzeContext({
        breakdown: { conversation: 85000 },
      });
      expect(healthyStatus.status).toBe('healthy');
    });

    it('should auto-update limit from enhanced analysis in checkHealth', () => {
      monitor.setContextProvider(
        () =>
          ({
            breakdown: { conversation: 90000 },
            modelContextLimit: 200000,
          }) as ContextAnalysisInput & { modelContextLimit: number }
      );

      monitor.checkHealth();
      expect(monitor.getConfig().effectiveContextLimit).toBe(200000);
    });

    it('should produce Opus utilization against 200k limit', () => {
      monitor.setEffectiveContextLimit(200000);
      const status = monitor.analyzeContext({
        breakdown: { conversation: 100000 },
      });
      // 100k / 200k = 50%
      expect(status.utilizationPercent).toBe(50);
      expect(status.tokensLimit).toBe(200000);
    });
  });

  describe('dispose', () => {
    it('should stop monitoring on dispose', () => {
      vi.useFakeTimers();

      let callCount = 0;
      monitor.setContextProvider(() => {
        callCount++;
        return { breakdown: { conversation: 10000 } };
      });

      monitor.startMonitoring(1000);
      vi.advanceTimersByTime(2000);
      expect(callCount).toBe(2);

      monitor.dispose();

      vi.advanceTimersByTime(3000);
      expect(callCount).toBe(2); // No additional calls

      vi.useRealTimers();
    });

    it('should remove all listeners on dispose', () => {
      const handler = vi.fn();
      monitor.on('healthy', handler);

      monitor.dispose();

      // Create new monitor to verify old one is cleaned up
      const newMonitor = new ContextHealthMonitor();
      newMonitor.analyzeContext({ breakdown: { conversation: 10000 } });

      expect(handler).not.toHaveBeenCalled();
      newMonitor.dispose();
    });
  });
});
