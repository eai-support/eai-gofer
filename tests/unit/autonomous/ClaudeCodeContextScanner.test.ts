/**
 * Unit tests for ClaudeCodeContextScanner
 *
 * Feature 023-context-window-accuracy
 * Tests: T001-T009
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodeContextScanner } from '../../../extension/src/autonomous/ClaudeCodeContextScanner';

describe('ClaudeCodeContextScanner', () => {
  let tempDir: string;
  let workspacePath: string;
  let homePath: string;
  let scanner: ClaudeCodeContextScanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    workspacePath = path.join(tempDir, 'workspace');
    homePath = path.join(tempDir, 'home');
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.mkdirSync(homePath, { recursive: true });
    scanner = new ClaudeCodeContextScanner(workspacePath, homePath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── T001: ScanResult interface ────────────────────────────────

  describe('scan() returns correct ScanResult structure', () => {
    it('returns all 5 categories', () => {
      const result = scanner.scan();
      expect(result.categories).toHaveLength(5);
      expect(result.categories.map((c) => c.name)).toEqual([
        'CLAUDE.md & Rules',
        'Auto Memory',
        'Agents & Commands',
        'Spec Artifacts',
        'System Overhead',
      ]);
    });

    it('returns measuredTokens as sum of all categories', () => {
      const result = scanner.scan();
      const sum = result.categories.reduce((s, c) => s + c.totalTokens, 0);
      expect(result.measuredTokens).toBe(sum);
    });

    it('returns scannedAt timestamp', () => {
      const before = Date.now();
      const result = scanner.scan();
      expect(result.scannedAt).toBeGreaterThanOrEqual(before);
      expect(result.scannedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // ── T002: scanClaudeMdAndRules() ──────────────────────────────

  describe('scanClaudeMdAndRules()', () => {
    it('reads workspace CLAUDE.md', () => {
      const content = '# Claude Instructions\n\nSome rules here.';
      fs.writeFileSync(path.join(workspacePath, 'CLAUDE.md'), content);

      const result = scanner.scanClaudeMdAndRules();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].displayPath).toBe('CLAUDE.md');
      expect(result.files[0].bytes).toBe(Buffer.byteLength(content));
      expect(result.files[0].tokens).toBe(Math.ceil(Buffer.byteLength(content) / 4));
      expect(result.totalTokens).toBe(result.files[0].tokens);
    });

    it('reads project rules files', () => {
      const rulesDir = path.join(workspacePath, '.claude', 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(path.join(rulesDir, 'rule1.md'), 'Rule one content');
      fs.writeFileSync(path.join(rulesDir, 'rule2.md'), 'Rule two content');

      const result = scanner.scanClaudeMdAndRules();
      const ruleFiles = result.files.filter((f) => f.displayPath.includes('rules'));
      expect(ruleFiles).toHaveLength(2);
    });

    it('returns empty files when nothing exists', () => {
      const result = scanner.scanClaudeMdAndRules();
      expect(result.files).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it('has correct category metadata', () => {
      const result = scanner.scanClaudeMdAndRules();
      expect(result.name).toBe('CLAUDE.md & Rules');
      expect(result.icon).toBe('file-text');
      expect(result.expandable).toBe(false);
    });
  });

  // ── T003: scanAutoMemory() ────────────────────────────────────

  describe('scanAutoMemory()', () => {
    it('returns empty when no project dir exists', () => {
      const result = scanner.scanAutoMemory();
      expect(result.files).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it('has correct category metadata', () => {
      const result = scanner.scanAutoMemory();
      expect(result.name).toBe('Auto Memory');
      expect(result.icon).toBe('brain');
    });
  });

  // ── T004: scanAgentsAndCommands() ─────────────────────────────

  describe('scanAgentsAndCommands()', () => {
    it('reads agent files from .claude/agents/', () => {
      const agentsDir = path.join(workspacePath, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'locator.md'), 'Agent locator content here');
      fs.writeFileSync(path.join(agentsDir, 'analyzer.md'), 'Agent analyzer content');

      const result = scanner.scanAgentsAndCommands();
      expect(result.files).toHaveLength(2);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('returns empty when no agents directory', () => {
      const result = scanner.scanAgentsAndCommands();
      expect(result.files).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });

    it('has note about on-demand loading', () => {
      const result = scanner.scanAgentsAndCommands();
      expect(result.note).toContain('Task tool');
    });
  });

  // ── T005: scanSpecArtifacts() ─────────────────────────────────

  describe('scanSpecArtifacts()', () => {
    it('reads constitution.md', () => {
      const constDir = path.join(workspacePath, '.specify', 'memory');
      fs.mkdirSync(constDir, { recursive: true });
      fs.writeFileSync(path.join(constDir, 'constitution.md'), 'Constitution content');

      const result = scanner.scanSpecArtifacts();
      expect(result.files.some((f) => f.displayPath.includes('constitution.md'))).toBe(true);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('reads AGENTS.md', () => {
      fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), 'Agent guidelines');

      const result = scanner.scanSpecArtifacts();
      expect(result.files.some((f) => f.displayPath === 'AGENTS.md')).toBe(true);
    });

    it('returns empty when files do not exist', () => {
      const result = scanner.scanSpecArtifacts();
      expect(result.files).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
    });
  });

  // ── T006: getSystemOverhead() ─────────────────────────────────

  describe('getSystemOverhead()', () => {
    it('returns fixed ~14,800 token estimate', () => {
      const result = scanner.getSystemOverhead();
      expect(result.totalTokens).toBe(14800);
    });

    it('includes System Prompt and Tool Schemas entries', () => {
      const result = scanner.getSystemOverhead();
      expect(result.files).toHaveLength(2);
      expect(result.files[0].displayPath).toBe('System Prompt');
      expect(result.files[0].tokens).toBe(3200);
      expect(result.files[1].displayPath).toBe('Tool Schemas');
      expect(result.files[1].tokens).toBe(11600);
    });

    it('has explanatory note', () => {
      const result = scanner.getSystemOverhead();
      expect(result.note).toContain('invisible');
    });
  });

  // ── T007: scan() orchestrator ─────────────────────────────────

  describe('scan() orchestrator', () => {
    it('includes system overhead in measuredTokens even with no files', () => {
      const result = scanner.scan();
      // At minimum, system overhead should be present
      expect(result.measuredTokens).toBeGreaterThanOrEqual(14800);
    });

    it('includes file-based tokens when files exist', () => {
      fs.writeFileSync(path.join(workspacePath, 'CLAUDE.md'), 'x'.repeat(400));
      const agentsDir = path.join(workspacePath, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'test.md'), 'y'.repeat(200));

      const result = scanner.scan();
      // 14800 (overhead) + 100 (400/4) + 50 (200/4) = 14950
      expect(result.measuredTokens).toBe(14950);
    });
  });

  // ── T008: Caching ─────────────────────────────────────────────

  describe('caching', () => {
    it('returns same result on second call within TTL', () => {
      const result1 = scanner.scan();
      const result2 = scanner.scan();
      expect(result1).toBe(result2); // same object reference
    });

    it('returns fresh result after invalidation', () => {
      const result1 = scanner.scan();
      scanner.invalidate();
      const result2 = scanner.scan();
      expect(result1).not.toBe(result2); // different object reference
    });

    it('returns fresh result when files change after invalidation', () => {
      const result1 = scanner.scan();
      const initialTokens = result1.measuredTokens;

      // Add a file
      fs.writeFileSync(path.join(workspacePath, 'CLAUDE.md'), 'x'.repeat(1000));
      scanner.invalidate();

      const result2 = scanner.scan();
      expect(result2.measuredTokens).toBeGreaterThan(initialTokens);
    });
  });

  // ── Token estimation consistency ──────────────────────────────

  describe('token estimation', () => {
    it('uses Math.ceil(bytes / 4) consistently', () => {
      // 13 bytes → ceil(13/4) = 4 tokens
      fs.writeFileSync(path.join(workspacePath, 'CLAUDE.md'), '1234567890123');

      const result = scanner.scanClaudeMdAndRules();
      expect(result.files[0].bytes).toBe(13);
      expect(result.files[0].tokens).toBe(4); // ceil(13/4)
    });
  });
});
