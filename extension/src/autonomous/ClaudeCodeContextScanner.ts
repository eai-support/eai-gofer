/**
 * ClaudeCodeContextScanner
 *
 * Reads all files that Claude Code loads into its context window and returns
 * per-category token breakdowns. Replaces the hardcoded percentage estimates
 * in ContextWindowProvider with real measurements.
 *
 * Categories scanned:
 * 1. CLAUDE.md & Rules — project/user/local CLAUDE.md + rules files
 * 2. Auto Memory — MEMORY.md (first 200 lines) + topic files
 * 3. Agents & Commands — .claude/agents/*.md
 * 4. System Overhead — fixed estimate for invisible system prompt + tool schemas
 * 5. Spec Artifacts — constitution.md + Gofer spec files
 *
 * Feature 023-context-window-accuracy
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Token count for a single file */
export interface FileTokenInfo {
  /** Absolute path to the file */
  filePath: string;
  /** Display-friendly relative path */
  displayPath: string;
  /** File size in bytes */
  bytes: number;
  /** Estimated token count (bytes / 4) */
  tokens: number;
}

/** Token breakdown for a single category */
export interface CategoryBreakdown {
  /** Category display name */
  name: string;
  /** VSCode ThemeIcon id */
  icon: string;
  /** Total tokens for this category */
  totalTokens: number;
  /** Individual file breakdowns */
  files: FileTokenInfo[];
  /** Whether this category is expandable (has subcategories) */
  expandable: boolean;
  /** Optional description shown below the token count */
  note?: string;
}

/** Complete scan result across all categories */
export interface ScanResult {
  /** Per-category breakdowns */
  categories: CategoryBreakdown[];
  /** Sum of all file-based category tokens */
  measuredTokens: number;
  /** Timestamp of this scan */
  scannedAt: number;
}

/** Auto memory MEMORY.md line limit (Claude Code truncates at 200) */
const MEMORY_LINE_LIMIT = 200;

/** System overhead: invisible system prompt + tool schemas */
const SYSTEM_PROMPT_TOKENS = 3200;
const TOOL_SCHEMA_TOKENS = 11600;
const SYSTEM_OVERHEAD_TOKENS = SYSTEM_PROMPT_TOKENS + TOOL_SCHEMA_TOKENS;

/** Cache TTL in milliseconds */
const CACHE_TTL_MS = 30_000;

export class ClaudeCodeContextScanner {
  private workspacePath: string;
  private homePath: string;
  private cachedResult: ScanResult | null = null;
  private cacheTimestamp: number = 0;

  constructor(workspacePath: string, homePath: string = os.homedir()) {
    this.workspacePath = workspacePath;
    this.homePath = homePath;
  }

  /**
   * Returns the encoded project directory path under ~/.claude/projects/.
   * Reuses the same encoding as ClaudeSessionReader.
   */
  private getProjectDir(): string {
    const normalized = this.workspacePath.replace(/\\/g, '/');
    const encoded = normalized.replace(/\//g, '-');
    return path.join(this.homePath, '.claude', 'projects', encoded);
  }

  /** Estimate tokens from byte count (consistent with codebase convention) */
  private estimateTokens(bytes: number): number {
    return Math.ceil(bytes / 4);
  }

  /** Safely read a file's byte length, returning 0 if it doesn't exist */
  private safeFileBytes(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  /** Safely read file content, returning empty string if it doesn't exist */
  private safeReadFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /** List .md files in a directory, returning empty array if dir doesn't exist */
  private listMdFiles(dirPath: string): string[] {
    try {
      return fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(dirPath, f));
    } catch {
      return [];
    }
  }

  /** Build a FileTokenInfo from an absolute path */
  private fileInfo(filePath: string, bytes: number, relativeTo?: string): FileTokenInfo {
    let displayPath: string;
    const home = this.homePath;
    if (relativeTo && filePath.startsWith(relativeTo)) {
      displayPath = path.relative(relativeTo, filePath);
    } else if (filePath.startsWith(home)) {
      displayPath = '~/' + path.relative(home, filePath);
    } else {
      displayPath = filePath;
    }
    return {
      filePath,
      displayPath,
      bytes,
      tokens: this.estimateTokens(bytes),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Category Scanners
  // ─────────────────────────────────────────────────────────────────

  /**
   * Scans CLAUDE.md files and rules directories.
   * - {workspace}/CLAUDE.md
   * - ~/.claude/CLAUDE.md
   * - {workspace}/.claude/CLAUDE.md
   * - {workspace}/.claude/rules/*.md
   * - ~/.claude/rules/*.md
   */
  scanClaudeMdAndRules(): CategoryBreakdown {
    const files: FileTokenInfo[] = [];
    const home = this.homePath;

    // CLAUDE.md hierarchy
    const claudeMdPaths = [
      path.join(this.workspacePath, 'CLAUDE.md'),
      path.join(home, '.claude', 'CLAUDE.md'),
      path.join(this.workspacePath, '.claude', 'CLAUDE.md'),
    ];

    for (const p of claudeMdPaths) {
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes, this.workspacePath));
      }
    }

    // Project rules
    const projectRules = this.listMdFiles(path.join(this.workspacePath, '.claude', 'rules'));
    for (const p of projectRules) {
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes, this.workspacePath));
      }
    }

    // User rules
    const userRules = this.listMdFiles(path.join(home, '.claude', 'rules'));
    for (const p of userRules) {
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes));
      }
    }

    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    return {
      name: 'CLAUDE.md & Rules',
      icon: 'file-text',
      totalTokens,
      files,
      expandable: false,
    };
  }

  /**
   * Scans auto memory files from ~/.claude/projects/{encoded}/memory/.
   * MEMORY.md is truncated to first 200 lines (matching Claude Code behavior).
   */
  scanAutoMemory(): CategoryBreakdown {
    const files: FileTokenInfo[] = [];
    const memoryDir = path.join(this.getProjectDir(), 'memory');

    // MEMORY.md — first 200 lines only
    const memoryMdPath = path.join(memoryDir, 'MEMORY.md');
    const memoryContent = this.safeReadFile(memoryMdPath);
    if (memoryContent) {
      const truncated = memoryContent.split('\n').slice(0, MEMORY_LINE_LIMIT).join('\n');
      const bytes = Buffer.byteLength(truncated, 'utf-8');
      files.push(this.fileInfo(memoryMdPath, bytes));
    }

    // Topic files (everything except MEMORY.md)
    const allMemoryFiles = this.listMdFiles(memoryDir);
    for (const p of allMemoryFiles) {
      if (path.basename(p) === 'MEMORY.md') {continue;}
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes));
      }
    }

    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    return {
      name: 'Auto Memory',
      icon: 'brain',
      totalTokens,
      files,
      expandable: false,
    };
  }

  /**
   * Scans agent files from {workspace}/.claude/agents/.
   * Agent files are loaded when the Task tool references them.
   */
  scanAgentsAndCommands(): CategoryBreakdown {
    const files: FileTokenInfo[] = [];
    const agentsDir = path.join(this.workspacePath, '.claude', 'agents');

    const agentFiles = this.listMdFiles(agentsDir);
    for (const p of agentFiles) {
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes, this.workspacePath));
      }
    }

    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    return {
      name: 'Agents & Commands',
      icon: 'robot',
      totalTokens,
      files,
      expandable: false,
      note: 'Agent files load when Task tool is used. Commands load on invocation.',
    };
  }

  /**
   * Scans Gofer spec artifacts: constitution.md + AGENTS.md.
   */
  scanSpecArtifacts(): CategoryBreakdown {
    const files: FileTokenInfo[] = [];

    const specFiles = [
      path.join(this.workspacePath, '.specify', 'memory', 'constitution.md'),
      path.join(this.workspacePath, 'AGENTS.md'),
    ];

    for (const p of specFiles) {
      const bytes = this.safeFileBytes(p);
      if (bytes > 0) {
        files.push(this.fileInfo(p, bytes, this.workspacePath));
      }
    }

    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    return {
      name: 'Spec Artifacts',
      icon: 'file-code',
      totalTokens,
      files,
      expandable: false,
    };
  }

  /**
   * Returns the fixed system overhead estimate.
   * System prompt and tool schemas are invisible from outside Claude Code.
   */
  getSystemOverhead(): CategoryBreakdown {
    return {
      name: 'System Overhead',
      icon: 'gear',
      totalTokens: SYSTEM_OVERHEAD_TOKENS,
      files: [
        {
          filePath: '(built-in)',
          displayPath: 'System Prompt',
          bytes: SYSTEM_PROMPT_TOKENS * 4,
          tokens: SYSTEM_PROMPT_TOKENS,
        },
        {
          filePath: '(built-in)',
          displayPath: 'Tool Schemas',
          bytes: TOOL_SCHEMA_TOKENS * 4,
          tokens: TOOL_SCHEMA_TOKENS,
        },
      ],
      expandable: false,
      note: 'These are invisible components baked into every Claude Code API call. Token counts are estimates based on research.',
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Orchestrator
  // ─────────────────────────────────────────────────────────────────

  /**
   * Runs all category scans and returns the aggregated result.
   * Results are cached for 30 seconds.
   */
  scan(): ScanResult {
    const now = Date.now();
    if (this.cachedResult && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const categories = [
      this.scanClaudeMdAndRules(),
      this.scanAutoMemory(),
      this.scanAgentsAndCommands(),
      this.scanSpecArtifacts(),
      this.getSystemOverhead(),
    ];

    const measuredTokens = categories.reduce((sum, cat) => sum + cat.totalTokens, 0);

    const result: ScanResult = {
      categories,
      measuredTokens,
      scannedAt: now,
    };

    this.cachedResult = result;
    this.cacheTimestamp = now;

    return result;
  }

  /** Invalidate the cache, forcing a fresh scan on next call */
  invalidate(): void {
    this.cachedResult = null;
    this.cacheTimestamp = 0;
  }
}
