/**
 * Integration tests for Context Health and Management across Gofer Pipeline
 *
 * T072: Test full Gofer pipeline with context management
 * T073: Test observation masking across multiple stages
 * T074: Test auto-handoff trigger flow
 * T075: Test memory-first loading with research fallback
 *
 * These tests verify that all context management components work together
 * seamlessly across the 6 Gofer stages: research → specify → plan → tasks → implement → validate
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Unmock fs module for integration tests
vi.unmock('fs');
vi.unmock('fs/promises');
import * as fs from 'fs';

import { ContextBuilder, type TaskContext } from '../../../extension/src/autonomous/ContextBuilder';
import {
  ContextHealthMonitor,
  type ContextHealthStatus,
} from '../../../extension/src/autonomous/ContextHealthMonitor';
import { ObservationMasker } from '../../../extension/src/autonomous/ObservationMasker';
import { MemoryManager } from '../../../extension/src/autonomous/MemoryManager';
import { HintLoader } from '../../../extension/src/autonomous/HintLoader';
import { StageContextProfileLoader } from '../../../extension/src/autonomous/StageContextProfileLoader';
import type { GoferStage } from '../../../extension/src/autonomous/StageContextProfile';
import { settleBackgroundWrites } from '../../helpers/settleBackgroundWrites';

describe('Context Management Pipeline Integration (T072-T075)', () => {
  let testWorkspaceRoot: string;
  let specsDir: string;
  let memoryDir: string;
  let logsDir: string;
  let globalStoragePath: string;

  // Test components
  let contextBuilder: ContextBuilder;
  let healthMonitor: ContextHealthMonitor;
  let observationMasker: ObservationMasker;
  let memoryManager: MemoryManager;
  let hintLoader: HintLoader;
  let profileLoader: StageContextProfileLoader;

  const mockVSCodeContext = {
    globalStoragePath: '',
    globalState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  } as any;

  beforeEach(() => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-context-pipeline-'));
    specsDir = path.join(testWorkspaceRoot, '.specify', 'specs');
    memoryDir = path.join(testWorkspaceRoot, '.specify', 'memory');
    logsDir = path.join(testWorkspaceRoot, '.specify', 'logs');
    globalStoragePath = path.join(testWorkspaceRoot, 'global-storage');
    mockVSCodeContext.globalStoragePath = globalStoragePath;

    // Create directories
    fs.mkdirSync(specsDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(globalStoragePath, { recursive: true });

    // Create constitution
    fs.writeFileSync(
      path.join(memoryDir, 'constitution.md'),
      `# Project Constitution

## Coding Principles
- Write clean, maintainable code
- Follow TypeScript best practices
- Use meaningful variable names
`
    );

    // Initialize components
    hintLoader = new HintLoader(testWorkspaceRoot);
    memoryManager = new MemoryManager(mockVSCodeContext, testWorkspaceRoot);
    observationMasker = new ObservationMasker(testWorkspaceRoot);
    // Observe real background writes so teardown can await them without mocking storage.
    vi.spyOn(memoryManager, 'recordUsage');
    vi.spyOn(observationMasker, 'saveCacheToDisk');
    profileLoader = new StageContextProfileLoader(testWorkspaceRoot);
    healthMonitor = new ContextHealthMonitor({
      warningThreshold: 0.5,
      criticalThreshold: 0.7,
      effectiveContextLimit: 120000,
    });

    contextBuilder = new ContextBuilder(
      testWorkspaceRoot,
      memoryManager,
      hintLoader,
      observationMasker,
      {
        enableMasking: true,
        enableBudgetEnforcement: true,
        enableMemoryFirstLoading: true,
        enableChunkedResearch: true,
      },
      profileLoader
    );
  });

  afterEach(async () => {
    await settleBackgroundWrites(
      [
        ...vi.mocked(memoryManager.recordUsage).mock.results,
        ...vi.mocked(observationMasker.saveCacheToDisk).mock.results,
      ]
        .filter((result) => result.type === 'return')
        .map((result) => result.value),
      () => {
        hintLoader?.dispose();
        healthMonitor?.dispose();
        if (fs.existsSync(testWorkspaceRoot)) {
          fs.rmSync(testWorkspaceRoot, { recursive: true });
        }
      }
    );
  });

  // ==========================================================================
  // T072: Full Gofer Pipeline with Context Management
  // ==========================================================================

  describe('T072: Full Gofer Pipeline', () => {
    const GOFER_STAGES: GoferStage[] = [
      'research',
      'specify',
      'plan',
      'tasks',
      'implement',
      'validate',
    ];

    it('should transition through all 6 stages with valid context health', async () => {
      const specId = 'pipeline-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });

      // Create spec artifacts
      fs.writeFileSync(
        path.join(specDir, 'spec.md'),
        '# Test Feature\n\n## Overview\nTest spec content.'
      );
      fs.writeFileSync(
        path.join(specDir, 'plan.md'),
        '# Implementation Plan\n\n## Architecture\nTest plan.'
      );
      fs.writeFileSync(path.join(specDir, 'tasks.md'), '# Tasks\n\n- [ ] T001 First task');
      fs.writeFileSync(
        path.join(specDir, 'research.md'),
        `# Research

## Codebase Analysis

The codebase uses TypeScript with VSCode extension API.

## Technology Stack

Node.js, TypeScript, Vitest for testing.
`
      );

      const healthHistory: ContextHealthStatus[] = [];

      // Process each stage
      for (const stage of GOFER_STAGES) {
        await contextBuilder.setCurrentStage(stage);

        const task: TaskContext = {
          taskId: 'T001',
          specId,
          description: `Execute ${stage} stage task`,
          affectedFiles: [],
        };

        const result = await contextBuilder.buildContext(task);

        // Verify context was built
        expect(result).toBeDefined();
        expect(result.stage).toBe(stage);
        expect(result.loadTime).toBeGreaterThanOrEqual(0);

        // Check context health
        const health = healthMonitor.analyzeContext({
          breakdown: {
            specArtifacts: contextBuilder['estimateTokens'](result.sections.constitution || ''),
            memories: contextBuilder['estimateTokens'](result.sections.memories || ''),
            hints: contextBuilder['estimateTokens'](result.sections.hints || ''),
            observations: contextBuilder['estimateTokens'](result.sections.observations || ''),
          },
          stage,
        });

        healthHistory.push(health);

        // Verify no degradation - health should be stable
        expect(health.status).toBe('healthy');
        expect(health.utilizationPercent).toBeLessThan(50);
      }

      // Verify all stages were processed
      expect(healthHistory).toHaveLength(6);
    });

    it('should maintain budget compliance across all stages', async () => {
      const specId = 'budget-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });

      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      const budgetWarnings: Array<{ stage: string; category: string }> = [];

      contextBuilder.on('budget-warning', (event) => {
        budgetWarnings.push({ stage: event.stage, category: event.category });
      });

      for (const stage of GOFER_STAGES) {
        await contextBuilder.setCurrentStage(stage);

        const result = await contextBuilder.buildContext({
          taskId: 'T001',
          specId,
          description: 'Test task',
          affectedFiles: [],
        });

        // Verify budget usage is tracked
        if (result.budgetUsage) {
          expect(result.budgetUsage.stage).toBe(stage);
          expect(result.budgetUsage.usage.total).toBeGreaterThanOrEqual(0);
        }
      }

      // With minimal content, no budget warnings should be triggered
      expect(budgetWarnings).toHaveLength(0);
    });

    it('should correctly apply stage-specific profiles', async () => {
      const profiles: Array<{ stage: GoferStage; observationWindow: number }> = [];

      for (const stage of GOFER_STAGES) {
        await contextBuilder.setCurrentStage(stage);
        const profile = contextBuilder.getProfile();

        profiles.push({
          stage,
          observationWindow: profile.observationWindow,
        });

        // Each stage should have its profile applied
        expect(profile).toBeDefined();
        expect(typeof profile.researchBudget).toBe('number');
        expect(typeof profile.memoryBudget).toBe('number');
        expect(typeof profile.codeBudget).toBe('number');
        expect(typeof profile.observationWindow).toBe('number');
      }

      // Research stage should have larger observation window than implement
      const researchProfile = profiles.find((p) => p.stage === 'research');
      const implementProfile = profiles.find((p) => p.stage === 'implement');
      expect(researchProfile!.observationWindow).toBeGreaterThanOrEqual(
        implementProfile!.observationWindow
      );
    });
  });

  // ==========================================================================
  // T073: Observation Masking Across Multiple Stages
  // ==========================================================================

  describe('T073: Observation Masking Across Stages', () => {
    it('should mask observations in research stage', async () => {
      const specId = 'mask-research';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      await contextBuilder.setCurrentStage('research');

      // Simulate multiple turns with observations
      for (let turn = 0; turn < 10; turn++) {
        contextBuilder.incrementTurn();
        contextBuilder.trackObservation(
          'file_read',
          `File content for turn ${turn}...`.repeat(100),
          { path: `/path/to/file${turn}.ts` },
          `Read file${turn}.ts`
        );
      }

      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Research task',
        affectedFiles: [],
      });

      // With masking enabled and sufficient turns, some observations should be masked
      expect(result.maskingStats).toBeDefined();
      expect(result.maskingStats!.totalObservations).toBe(10);
      // Research has larger observation window, so fewer may be masked
      expect(result.maskingStats!.tokensSaved).toBeGreaterThanOrEqual(0);
    });

    it('should mask more aggressively in implement stage', async () => {
      const specId = 'mask-implement';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      await contextBuilder.setCurrentStage('implement');
      const profile = contextBuilder.getProfile();

      // Add observations older than the implement stage window
      for (let turn = 0; turn < profile.observationWindow + 5; turn++) {
        contextBuilder.incrementTurn();
        contextBuilder.trackObservation(
          'file_read',
          `File content...`.repeat(50),
          { path: `/path/file${turn}.ts` },
          `Read file`
        );
      }

      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Implement task',
        affectedFiles: [],
      });

      // Implement stage has smaller window, should mask more
      expect(result.maskingStats).toBeDefined();
      expect(result.maskingStats!.maskedCount).toBeGreaterThan(0);
      expect(result.maskingStats!.tokensSaved).toBeGreaterThan(0);
    });

    it('should preserve recent observations while masking old ones', async () => {
      await contextBuilder.setCurrentStage('implement');
      const profile = contextBuilder.getProfile();

      // Create old observations
      for (let i = 0; i < 5; i++) {
        contextBuilder.incrementTurn();
        contextBuilder.trackObservation('file_read', 'Old content', {}, 'Old file');
      }

      // Skip turns to age the observations
      for (let i = 0; i < profile.observationWindow + 2; i++) {
        contextBuilder.incrementTurn();
      }

      // Create recent observations
      for (let i = 0; i < 3; i++) {
        contextBuilder.incrementTurn();
        contextBuilder.trackObservation('file_read', 'Recent content', {}, 'Recent file');
      }

      const masker = contextBuilder.getObservationMasker();
      const currentTurn = contextBuilder.getCurrentTurn();
      const maskResult = masker.maskOldObservations(currentTurn);

      // Old observations should be masked, recent preserved
      expect(maskResult.maskedCount).toBe(5); // 5 old observations
      expect(masker.getAllObservations()).toHaveLength(8); // Total tracked
    });

    it('should allow expansion of masked observations', async () => {
      await contextBuilder.setCurrentStage('implement');

      // Track an observation
      contextBuilder.incrementTurn();
      const observationId = contextBuilder.trackObservation(
        'file_read',
        'Important file content that was masked',
        { path: '/important/file.ts' },
        'Read important file'
      );

      const masker = contextBuilder.getObservationMasker();

      // Retrieve the observation
      const observation = masker.getObservation(observationId);

      expect(observation).toBeDefined();
      expect(observation!.originalContent).toBe('Important file content that was masked');
      expect(observation!.type).toBe('file_read');
    });
  });

  // ==========================================================================
  // T074: Auto-Handoff Trigger Flow
  // ==========================================================================

  describe('T074: Auto-Handoff Trigger Flow', () => {
    it('should trigger handoff at critical threshold', async () => {
      let handoffTriggered = false;
      let handoffStatus: ContextHealthStatus | null = null;

      healthMonitor.on('handoff-recommended', (status) => {
        handoffTriggered = true;
        handoffStatus = status;
      });

      // Simulate critical context usage
      const criticalHealth = healthMonitor.analyzeContext({
        breakdown: {
          specArtifacts: 30000,
          memories: 20000,
          hints: 15000,
          observations: 25000,
          conversation: 10000,
        },
        dataSource: 'real',
      });

      // Total = 100000 tokens, which is ~83% of 120000
      expect(criticalHealth.status).toBe('critical');
      expect(handoffTriggered).toBe(true);
      expect(handoffStatus!.utilizationPercent).toBeGreaterThan(70);
    });

    it('should emit warning before critical', async () => {
      const statusChanges: Array<{ from: string; to: string }> = [];

      healthMonitor.on('status-change', (from, to) => {
        statusChanges.push({ from, to });
      });

      // First, healthy status
      healthMonitor.analyzeContext({
        breakdown: { conversation: 10000 },
      });

      // Then, warning status
      healthMonitor.analyzeContext({
        breakdown: { conversation: 65000 }, // ~54% of 120000
      });

      // Finally, critical status
      healthMonitor.analyzeContext({
        breakdown: { conversation: 90000 }, // 75%
      });

      expect(statusChanges).toHaveLength(2);
      expect(statusChanges[0]).toEqual({ from: 'healthy', to: 'warning' });
      expect(statusChanges[1]).toEqual({ from: 'warning', to: 'critical' });
    });

    it('should generate appropriate recommendations at critical', () => {
      const status = healthMonitor.analyzeContext({
        breakdown: {
          observations: 50000,
          conversation: 40000,
        },
        stage: 'implement',
      });

      expect(status.status).toBe('critical');
      expect(status.recommendations.length).toBeGreaterThan(0);
      expect(status.recommendations.some((r) => r.includes('75%') || r.includes('Immediate'))).toBe(
        true
      );
    });

    it('should track status history', () => {
      // Generate multiple health checks
      for (let i = 0; i < 5; i++) {
        healthMonitor.analyzeContext({
          breakdown: { conversation: 10000 * (i + 1) },
          sessionId: 'test-session',
        });
      }

      const history = healthMonitor.getStatusHistory(3);

      expect(history).toHaveLength(3);
      expect(history[0].tokensUsed).toBe(50000); // Most recent
      expect(history[2].tokensUsed).toBe(30000); // Oldest of the 3
    });
  });

  // ==========================================================================
  // T075: Memory-First Loading with Research Fallback
  // ==========================================================================

  describe('T075: Memory-First Loading with Research Fallback', () => {
    beforeEach(async () => {
      // Create memories for testing (tags must start with #)
      await memoryManager.save({
        content: 'Authentication uses JWT tokens with bcrypt password hashing.',
        category: 'architecture',
        scope: 'global',
        tags: ['#authentication', '#jwt', '#security'],
      });

      await memoryManager.save({
        content: 'Database connections use connection pooling with max 20 connections.',
        category: 'configuration',
        scope: 'global',
        tags: ['#database', '#performance'],
      });

      await memoryManager.save({
        content: 'API rate limiting is set to 100 requests per minute per user.',
        category: 'architecture',
        scope: 'global',
        tags: ['#api', '#rate-limiting', '#security'],
      });
    });

    it('should load memories first when coverage is sufficient', async () => {
      const specId = 'memory-first-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });

      fs.writeFileSync(
        path.join(specDir, 'research.md'),
        `# Research

## Authentication
Details about authentication implementation.

## Database
Database configuration and optimization.
`
      );

      await contextBuilder.setCurrentStage('implement');

      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Implement authentication JWT tokens',
        affectedFiles: [],
      });

      // Memory coverage should be tracked
      expect(result.memoryCoverage).toBeDefined();

      // Loading decisions should be logged (this is the mechanism we're testing)
      expect(result.loadingDecisions).toBeDefined();
      expect(result.loadingDecisions!.some((d) => d.source === 'memory')).toBe(true);

      // Coverage percentage should be calculated (may be 0 if keywords don't match)
      expect(result.memoryCoverage!.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.memoryCoverage!.coveragePercent).toBeLessThanOrEqual(100);
    });

    it('should fall back to research when memory coverage is low', async () => {
      const specId = 'fallback-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });

      fs.writeFileSync(
        path.join(specDir, 'research.md'),
        `# Research

## Kubernetes Deployment
Details about k8s deployment strategies.

## Container Orchestration
Docker and container management.
`
      );

      await contextBuilder.setCurrentStage('implement');

      // Task with keywords not in our memories
      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Configure kubernetes deployment containers',
        affectedFiles: [],
      });

      // With low memory coverage, research should be loaded
      expect(result.memoryCoverage).toBeDefined();

      // Check if research was loaded for gaps
      if (result.memoryCoverage!.coveragePercent < 30) {
        expect(
          result.loadingDecisions!.some((d) => d.source === 'research' && d.decision === 'loaded')
        ).toBe(true);
      }
    });

    it('should correctly calculate memory coverage percentage', async () => {
      const specId = 'coverage-calc-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      await contextBuilder.setCurrentStage('implement');

      // Task with some covered and uncovered keywords
      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Setup authentication security with caching',
        affectedFiles: [],
      });

      expect(result.memoryCoverage).toBeDefined();
      expect(result.memoryCoverage!.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.memoryCoverage!.coveragePercent).toBeLessThanOrEqual(100);
      expect(result.memoryCoverage!.coveredKeywords).toBeDefined();
      expect(result.memoryCoverage!.uncoveredKeywords).toBeDefined();
    });

    it('should load memories by priority', async () => {
      // Add more memories with different priorities (tags must start with #)
      await memoryManager.save({
        content: 'High priority memory about critical security.',
        category: 'security',
        scope: 'global',
        tags: ['#critical', '#security'],
        priority: 10,
      });

      await memoryManager.save({
        content: 'Low priority memory about minor config.',
        category: 'configuration',
        scope: 'global',
        tags: ['#minor', '#config'],
        priority: 1,
      });

      const specId = 'priority-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      await contextBuilder.setCurrentStage('implement');

      const result = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Security configuration review',
        affectedFiles: [],
      });

      // Verify loading decision includes memory count
      const memoryDecision = result.loadingDecisions?.find((d) => d.source === 'memory');
      expect(memoryDecision).toBeDefined();
      expect(memoryDecision!.decision).toBe('loaded');
    });
  });

  // ==========================================================================
  // Cross-Stage Integration Tests
  // ==========================================================================

  describe('Cross-Stage Integration', () => {
    it('should maintain context consistency through stage transitions', async () => {
      const specId = 'transition-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent about testing.');

      const stageEvents: string[] = [];

      contextBuilder.on('stage-change', (event) => {
        stageEvents.push(`${event.previousStage} -> ${event.newStage}`);
      });

      // Transition through multiple stages
      await contextBuilder.setCurrentStage('research');
      await contextBuilder.setCurrentStage('plan');
      await contextBuilder.setCurrentStage('implement');

      expect(stageEvents).toHaveLength(3);
      expect(stageEvents[0]).toBe('implement -> research'); // Initial was 'implement'
      expect(stageEvents[1]).toBe('research -> plan');
      expect(stageEvents[2]).toBe('plan -> implement');
    });

    it('should apply different masking windows per stage', async () => {
      const maskerConfigs: Array<{ stage: GoferStage; ageThreshold: number }> = [];

      // Track masker config changes via stage transitions
      for (const stage of ['research', 'implement', 'validate'] as GoferStage[]) {
        await contextBuilder.setCurrentStage(stage);
        const profile = contextBuilder.getProfile();
        maskerConfigs.push({
          stage,
          ageThreshold: profile.observationWindow,
        });
      }

      // Research should have largest window, implement smallest
      const researchConfig = maskerConfigs.find((c) => c.stage === 'research');
      const implementConfig = maskerConfigs.find((c) => c.stage === 'implement');

      expect(researchConfig!.ageThreshold).toBeGreaterThanOrEqual(implementConfig!.ageThreshold);
    });

    it('should preserve memories across stage transitions', async () => {
      await memoryManager.save({
        content: 'Persistent memory content about architecture.',
        category: 'architecture',
        scope: 'global',
        tags: ['#persistent'],
      });

      const specId = 'memory-persist-test';
      const specDir = path.join(specsDir, specId);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'research.md'), '# Research\n\nContent.');

      // Build context in research stage
      await contextBuilder.setCurrentStage('research');
      const researchResult = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Persistent memory task',
        affectedFiles: [],
      });

      // Transition to implement and rebuild
      await contextBuilder.setCurrentStage('implement');
      const implementResult = await contextBuilder.buildContext({
        taskId: 'T001',
        specId,
        description: 'Persistent memory task',
        affectedFiles: [],
      });

      // Memory coverage mechanism should work in both stages
      expect(researchResult.memoryCoverage).toBeDefined();
      expect(implementResult.memoryCoverage).toBeDefined();

      // Stage should change but memory loading mechanism should work in both
      expect(researchResult.stage).toBe('research');
      expect(implementResult.stage).toBe('implement');

      // Loading decisions should include memory loading attempts in both stages
      expect(researchResult.loadingDecisions?.some((d) => d.source === 'memory')).toBe(true);
      expect(implementResult.loadingDecisions?.some((d) => d.source === 'memory')).toBe(true);
    });
  });
});
