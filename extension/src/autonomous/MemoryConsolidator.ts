/**
 * Memory Consolidation and Lifecycle Management
 *
 * Handles deduplication, semantic compaction, stale detection, priority decay,
 * and archival. Inspired by Manthan Gupta's "Memory Manager" layer — the
 * background maintenance process that keeps memory stores healthy.
 *
 * "Real intelligence depends on what we choose to forget."
 *
 * @see spec.md US5: Memory Lifecycle Management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Memory } from './memory';
import type { MemoryStorage } from './MemoryStorage';
import { Logger } from '../utils/logger';

// ============================================================================
// Constants
// ============================================================================

/** Memories older than this with low usage are candidates for compaction */
const COMPACTION_AGE_DAYS = 7;

/** Minimum usedCount to avoid compaction */
const COMPACTION_MIN_USES = 2;

/** Keyword overlap threshold for duplicate detection (0-1) */
const DEDUP_OVERLAP_THRESHOLD = 0.8;

/** Keyword overlap threshold for conflict detection (0-1) */
const CONFLICT_OVERLAP_THRESHOLD = 0.5;

/** Days without use before priority decay kicks in */
const DECAY_INACTIVE_DAYS = 30;

/** Priority decay amount per consolidation cycle */
const DECAY_AMOUNT = 1;

// ============================================================================
// Types
// ============================================================================

export interface ConsolidationResult {
  /** Number of duplicate memories merged */
  merged: number;
  /** Number of conflicting memories resolved (older superseded by newer) */
  conflictsResolved: number;
  /** Number of old memories compacted */
  compacted: number;
  /** Number of memories flagged as stale */
  flaggedStale: number;
  /** Number of memories with decayed priority */
  decayed: number;
  /** Number of memories archived */
  archived: number;
  /** Total memories before consolidation */
  totalBefore: number;
  /** Total memories after consolidation */
  totalAfter: number;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// MemoryConsolidator Class
// ============================================================================

/** T034: CitationVerifier interface for consolidation */
interface CitationVerifierLike {
  verifyCitations(text: string): { needsReview: boolean; staleCount?: number; totalCount?: number };
}

export class MemoryConsolidator {
  private citationVerifier: CitationVerifierLike | null = null;
  private logger = Logger.for('MemoryConsolidator');
  /** T083: Track processed sessions to avoid re-extraction */
  private processedSessionIds = new Set<string>();

  constructor(
    private storage: MemoryStorage,
    private workspaceRoot: string
  ) {}

  /** T034: Wire CitationVerifier for enhanced staleness checking */
  setCitationVerifier(verifier: CitationVerifierLike): void {
    this.citationVerifier = verifier;
  }

  /**
   * T081: Extract patterns from pipeline runs in pipeline.jsonl.
   *
   * Reads stage_complete events from pipeline.jsonl and extracts
   * validation_pattern and lesson memories from referenced report files.
   * T083: Uses session ID tracking to avoid re-extracting the same run.
   *
   * Non-blocking: errors are caught and swallowed (AC-4).
   *
   * @returns Number of memories extracted
   */
  async extractFromPipelineRuns(): Promise<number> {
    const pipelineLogPath = path.join(this.workspaceRoot, '.specify', 'logs', 'pipeline.jsonl');
    let extracted = 0;

    try {
      const content = await fs.readFile(pipelineLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          // T082: Only process stage_complete events
          if (event.event !== 'stage_complete') {
            continue;
          }

          const sessionId = String(event.sessionId ?? '');
          const stage = String(event.stage ?? '');

          // T083: Idempotency - skip already-processed sessions
          const key = `${sessionId}-${stage}`;
          if (this.processedSessionIds.has(key)) {
            continue;
          }
          this.processedSessionIds.add(key);

          // Look for validation or engineering review reports
          const reportPath = event.reportPath as string | undefined;
          if (!reportPath) {
            continue;
          }

          const absPath = path.isAbsolute(reportPath)
            ? reportPath
            : path.join(this.workspaceRoot, reportPath);

          const reportContent = await fs.readFile(absPath, 'utf-8').catch(() => null);
          if (!reportContent) {
            continue;
          }

          // Extract Red/Yellow patterns from the report
          const count = await this.extractPatternsFromReport(reportContent, sessionId);
          extracted += count;
        } catch (err) {
          this.logger.debug('Pattern extraction skipped (non-blocking)', err);
        }
      }
    } catch {
      // pipeline.jsonl may not exist yet - that's OK
    }

    if (extracted > 0) {
      this.logger.info('Extracted patterns from pipeline runs', { count: extracted });
    }
    return extracted;
  }

  /**
   * Extract Red/Yellow patterns from a report string and save as memories.
   * Reuses ValidationPatternExtractor logic inline to avoid circular deps.
   */
  private async extractPatternsFromReport(
    reportContent: string,
    featureId: string
  ): Promise<number> {
    const lines = reportContent.split('\n');
    let count = 0;

    for (const line of lines) {
      const isRed = /\*\*red\*\*:/i.test(line) || /^-\s*red:/i.test(line);
      const isYellow = /\*\*yellow\*\*:/i.test(line) || /^-\s*yellow:/i.test(line);

      if (!isRed && !isYellow) {
        continue;
      }

      const description = line
        .replace(/^#+\s*/, '')
        .replace(/^\s*[-*]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/\b(red|yellow)\b:?\s*/i, '')
        .trim();

      if (description.length < 10) {
        continue;
      }

      const category = isRed ? 'validation_pattern' : 'lesson';
      const tags = isRed
        ? ['#validation_pattern', '#severity:red', '#auto_extracted']
        : ['#lesson', '#severity:yellow', '#auto_extracted'];

      try {
        await this.storage.append({
          category,
          tags,
          scope: 'local',
          content: description,
          lastUsed: Date.now(),
          usedCount: 0,
          learnedFrom: featureId,
        });
        count++;
      } catch (err) {
        this.logger.debug('Memory append failed (non-blocking)', err);
      }
    }

    return count;
  }

  /**
   * Run the full consolidation pipeline:
   * 1. Detect and merge duplicates
   * 2. Flag stale memories (cited files changed)
   * 3. Compact old low-use memories
   * 4. Apply priority decay to inactive memories
   * 5. Archive compacted/merged memories
   */
  async consolidate(): Promise<ConsolidationResult> {
    const start = Date.now();
    const allMemories = this.storage.getAll();
    const totalBefore = allMemories.length;

    let merged = 0;
    let conflictsResolved = 0;
    let compacted: number;
    let flaggedStale: number;
    let decayed: number;
    const toArchive: string[] = [];

    // Step 1: Detect duplicates
    const duplicateGroups = this.findDuplicates(allMemories);
    for (const group of duplicateGroups) {
      if (group.length <= 1) {
        continue;
      }

      // Keep the highest-priority memory, archive the rest
      const sorted = [...group].sort((a, b) => (b.priorityIndex ?? 0) - (a.priorityIndex ?? 0));
      const keeper = sorted[0];
      const removals = sorted.slice(1);

      // Merge usage counts into the keeper
      const totalUsed = group.reduce((sum, m) => sum + (m.usedCount ?? 0), 0);
      await this.storage.update(keeper.id, {
        usedCount: totalUsed,
        lastUsed: Math.max(...group.map((m) => m.lastUsed)),
      });

      for (const dup of removals) {
        toArchive.push(dup.id);
      }
      merged += removals.length;
    }

    // Step 1.5: Detect and resolve conflicts (medium overlap + shared tags)
    const conflicts = this.findConflicts(allMemories);
    for (const conflict of conflicts) {
      if (toArchive.includes(conflict.older.id)) {
        continue;
      } // Already archived

      // Archive older memory with supersededBy reference
      await this.storage.update(conflict.older.id, {
        supersededBy: conflict.newer.id,
      });
      toArchive.push(conflict.older.id);
      conflictsResolved++;

      this.logger.info(
        `Conflict resolved: "${conflict.older.id}" superseded by "${conflict.newer.id}" (overlap=${conflict.overlap.toFixed(2)}, sharedTags=${conflict.sharedTags.join(',')})`
      );
    }

    // Step 2: Flag stale memories (cited files changed)
    const now = Date.now();
    flaggedStale = await this.compactStaleMemories(allMemories);

    // Step 3: Compact old low-use memories
    compacted = await this.applyCompression(allMemories, toArchive, now);

    // Step 4: Apply priority decay to inactive memories
    decayed = await this.applyPriorityDecay(allMemories, toArchive, now);

    // Step 5: Archive
    let archived = 0;
    if (toArchive.length > 0) {
      archived = await this.storage.archive(toArchive);
    }

    const totalAfter = this.storage.count();
    const durationMs = Date.now() - start;

    const result: ConsolidationResult = {
      merged,
      conflictsResolved,
      compacted,
      flaggedStale,
      decayed,
      archived,
      totalBefore,
      totalAfter,
      durationMs,
    };

    this.logger.info(
      `Consolidation complete: merged=${merged}, conflicts=${conflictsResolved}, compacted=${compacted}, stale=${flaggedStale}, decayed=${decayed}, archived=${archived}, ${totalBefore} → ${totalAfter} memories in ${durationMs}ms`
    );

    return result;
  }

  // --------------------------------------------------------------------------
  // Consolidation Helpers
  // --------------------------------------------------------------------------

  /**
   * Step 2: Flag stale memories whose cited files have changed.
   * Batches storage.update() calls with Promise.all to avoid N+1 pattern.
   */
  private async compactStaleMemories(memories: Memory[]): Promise<number> {
    const staleUpdates: Array<Promise<unknown>> = [];
    let flaggedStale = 0;

    // Batch all citation-staleness checks with Promise.all to avoid N+1 sequential I/O
    const memoriesWithCitations = memories.filter(
      (m) => m.citations && m.citations.length > 0 && !m.stale
    );
    const stalenessResults = await Promise.all(
      memoriesWithCitations.map((m) =>
        this.checkCitationStaleness(m).then((isStale) => ({ memory: m, isStale }))
      )
    );
    for (const { memory, isStale } of stalenessResults) {
      if (isStale) {
        staleUpdates.push(this.storage.update(memory.id, { stale: true }));
        flaggedStale++;
      }
    }

    // T034: Enhanced staleness via CitationVerifier — check content references
    for (const memory of memories) {
      if (this.citationVerifier && !memory.stale) {
        const result = this.citationVerifier.verifyCitations(memory.content);
        if (result.needsReview && result.staleCount && result.totalCount) {
          const staleRatio = result.staleCount / result.totalCount;
          if (staleRatio > 0.5) {
            const newPriority = Math.max(0, (memory.priorityIndex ?? 5) - 2);
            staleUpdates.push(
              this.storage.update(memory.id, { stale: true, priorityIndex: newPriority })
            );
            flaggedStale++;
          }
        }
      }
    }

    await Promise.all(staleUpdates);
    return flaggedStale;
  }

  /**
   * Step 3: Compact old low-use memories by truncating content.
   * Uses Promise.all to batch storage.update() calls.
   */
  private async applyCompression(
    memories: Memory[],
    toArchive: string[],
    now: number
  ): Promise<number> {
    const compactionAge = COMPACTION_AGE_DAYS * 24 * 60 * 60 * 1000;
    const staleMemories = memories.filter((memory) => {
      if (toArchive.includes(memory.id)) {
        return false;
      }
      const age = now - memory.created;
      const usage = memory.usedCount ?? 0;
      return age > compactionAge && usage < COMPACTION_MIN_USES && memory.content.length > 200;
    });

    await Promise.all(
      staleMemories.map((memory) =>
        this.storage.update(memory.id, {
          content: memory.content.substring(0, 200) + '... [compacted]',
          compactedFrom: memory.id,
        })
      )
    );

    return staleMemories.length;
  }

  /**
   * Step 4: Apply priority decay to inactive memories.
   * Uses Promise.all to batch storage.update() calls.
   */
  private async applyPriorityDecay(
    memories: Memory[],
    toArchive: string[],
    now: number
  ): Promise<number> {
    const decayAge = DECAY_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
    const decayMemories = memories.filter((memory) => {
      if (toArchive.includes(memory.id)) {
        return false;
      }
      const timeSinceUse = now - memory.lastUsed;
      const currentPriority = memory.priorityIndex ?? 0;
      return timeSinceUse > decayAge && currentPriority > 0;
    });

    await Promise.all(
      decayMemories.map((memory) => {
        const newPriority = Math.max(0, (memory.priorityIndex ?? 0) - DECAY_AMOUNT);
        return this.storage.update(memory.id, { priorityIndex: newPriority });
      })
    );

    return decayMemories.length;
  }

  // --------------------------------------------------------------------------
  // Duplicate Detection
  // --------------------------------------------------------------------------

  /**
   * Find groups of duplicate memories using keyword overlap.
   * Two memories are duplicates if their content has >80% keyword overlap.
   */
  private findDuplicates(memories: Memory[]): Memory[][] {
    const groups: Memory[][] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < memories.length; i++) {
      if (assigned.has(memories[i].id)) {
        continue;
      }

      const group: Memory[] = [memories[i]];
      assigned.add(memories[i].id);

      for (let j = i + 1; j < memories.length; j++) {
        if (assigned.has(memories[j].id)) {
          continue;
        }

        const overlap = this.calculateKeywordOverlap(memories[i].content, memories[j].content);
        if (overlap >= DEDUP_OVERLAP_THRESHOLD) {
          group.push(memories[j]);
          assigned.add(memories[j].id);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  // --------------------------------------------------------------------------
  // Conflict Detection
  // --------------------------------------------------------------------------

  /**
   * Find pairs of conflicting memories: medium keyword overlap (0.5-0.8)
   * AND at least one shared tag. These are memories that cover similar topics
   * but aren't exact duplicates — the newer one supersedes the older.
   */
  private findConflicts(
    memories: Memory[]
  ): Array<{ older: Memory; newer: Memory; overlap: number; sharedTags: string[] }> {
    const conflicts: Array<{
      older: Memory;
      newer: Memory;
      overlap: number;
      sharedTags: string[];
    }> = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const a = memories[i];
        const b = memories[j];

        const overlap = this.calculateKeywordOverlap(a.content, b.content);

        // Must be in the conflict range: >= 0.5 but < 0.8 (below dedup threshold)
        if (overlap < CONFLICT_OVERLAP_THRESHOLD || overlap >= DEDUP_OVERLAP_THRESHOLD) {
          continue;
        }

        // Must share at least one tag
        const sharedTags = (a.tags ?? []).filter((t) => (b.tags ?? []).includes(t));
        if (sharedTags.length === 0) {
          continue;
        }

        // Newer memory supersedes older
        const [older, newer] = a.created <= b.created ? [a, b] : [b, a];
        conflicts.push({ older, newer, overlap, sharedTags });
      }
    }

    return conflicts;
  }

  /**
   * Calculate keyword overlap between two text strings.
   * Returns 0-1 (Jaccard similarity of word sets).
   */
  private calculateKeywordOverlap(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 3)
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 3)
    );

    if (words1.size === 0 && words2.size === 0) {
      return 1;
    }
    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        intersection++;
      }
    }

    const union = new Set([...words1, ...words2]).size;
    return intersection / union;
  }

  // --------------------------------------------------------------------------
  // Stale Detection
  // --------------------------------------------------------------------------

  /**
   * Check if a memory's code citations are stale (files changed since creation).
   */
  private async checkCitationStaleness(memory: Memory): Promise<boolean> {
    if (!memory.citations || memory.citations.length === 0) {
      return false;
    }

    for (const citation of memory.citations) {
      let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
      try {
        const filePath = path.join(this.workspaceRoot, citation.file);
        fileHandle = await fs.open(filePath, 'r');
        const stat = await fileHandle.stat();
        const fileModified = stat.mtimeMs;

        // If file was modified after the memory was created, it's stale
        if (fileModified > memory.created) {
          return true;
        }

        // If a hash was stored, check if content changed
        if (citation.hash) {
          const content = await fileHandle.readFile('utf-8');
          const currentHash = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 6);
          if (currentHash !== citation.hash) {
            return true;
          }
        }
      } catch {
        // File doesn't exist anymore — definitely stale
        return true;
      } finally {
        await fileHandle?.close();
      }
    }

    return false;
  }
}
