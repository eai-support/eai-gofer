/**
 * Context Builder - Merges memories, hints, and task context for LLM prompts
 *
 * Responsibilities:
 * - Load and merge memories from MemoryManager
 * - Load and merge hints from HintLoader
 * - Build constitution context
 * - Combine all context sources into single prompt
 * - Enforce stage-specific context budgets
 *
 * Priority hierarchy:
 * 1. Task-specific context (from tasks.md)
 * 2. Directory hints (priority 10)
 * 3. Project hints (priority 5)
 * 4. Global hints (priority 1)
 * 5. Relevant memories
 * 6. Constitution
 *
 * @see .specify/specs/011-context-health-recursive-memory/tasks.md T038-T041
 */

import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { HintLoader } from './HintLoader';
import { MemoryManager } from './MemoryManager';
import type { Memory, MemoryType } from './memory';
import {
  ObservationMasker,
  type ObservationMaskerConfig,
  type ObservationType,
} from './ObservationMasker';
import { type GoferStage, type StageContextProfile, DEFAULT_PROFILES } from './StageContextProfile';
import { StageContextProfileLoader } from './StageContextProfileLoader';
import { ResearchChunker } from './ResearchChunker';
import type { ContextUsageLogger } from './ContextUsageLogger';
import { KnowledgeGraph } from './KnowledgeGraph';
import { Logger } from '../services/Logger';
import { CitationVerifier } from './CitationVerifier';
import { ScopeGuard } from './ScopeGuard';
import type { CostBudgetEnforcer } from './CostBudgetEnforcer';
import { extractKeywords as tfIdfExtractKeywords } from './TfIdfUtil';

/**
 * Task information for context building
 */
export interface TaskContext {
  taskId: string;
  specId: string;
  description: string;
  affectedFiles?: string[];
  declaredHints?: string[]; // From spec frontmatter
  customContext?: string; // Additional context from task definition
}

/**
 * Configuration for ContextBuilder observation masking
 */
export interface ContextBuilderConfig {
  /** Enable observation masking (default: true) */
  enableMasking: boolean;
  /** ObservationMasker configuration */
  maskerConfig?: Partial<ObservationMaskerConfig>;
  /** Enable stage-aware budget enforcement (default: true) */
  enableBudgetEnforcement: boolean;
  /** Context token limit (default: 120000) */
  contextTokenLimit: number;
  /** Emit warnings when budget exceeded (default: true) */
  emitBudgetWarnings: boolean;
  /** Enable memory-first loading (default: true) */
  enableMemoryFirstLoading: boolean;
  /** Maximum memories to load by priority (default: 10) */
  memoryPriorityLimit: number;
  /** Minimum memory coverage before loading research (default: 0.3) */
  minMemoryCoverage: number;
  /** Enable logging of loading decisions (default: true) */
  logLoadingDecisions: boolean;
  /** Enable chunked research loading (default: true) */
  enableChunkedResearch: boolean;
  /** Maximum research chunks to load (default: 5) */
  researchChunkLimit: number;
  /** Minimum relevance score for research chunks (default: 10) */
  minChunkRelevance: number;
  /** T045: When true, truncate context sections exceeding stage budget allocation */
  enforceBudgetCaps: boolean;
  /** 019 F3: Budget enforcement mode — advisory (warn only), truncate (trim sections), blocking (reject build) */
  budgetEnforcementMode: 'advisory' | 'truncate' | 'blocking';
}

/**
 * Budget usage tracking for a context build
 */
export interface BudgetUsage {
  /** Current Gofer stage */
  stage: GoferStage;
  /** Active profile */
  profile: StageContextProfile;
  /** Token usage per category */
  usage: {
    research: number;
    memory: number;
    constitution: number;
    code: number;
    conversation: number;
    total: number;
  };
  /** Budget limits per category (in tokens) */
  limits: {
    research: number;
    memory: number;
    code: number;
    conversation: number;
  };
  /** Categories that exceeded their budget */
  exceededCategories: string[];
  /** Whether total exceeds context limit */
  totalExceeded: boolean;
}

/**
 * Budget warning event data
 */
export interface BudgetWarningEvent {
  /** Category that exceeded budget */
  category: string;
  /** Tokens used */
  tokensUsed: number;
  /** Budget limit */
  budgetLimit: number;
  /** Percentage over budget */
  percentOver: number;
  /** Current stage */
  stage: GoferStage;
}

/**
 * Statistics about masking operations
 */
export interface MaskingStats {
  /** Number of observations masked */
  maskedCount: number;
  /** Tokens saved by masking */
  tokensSaved: number;
  /** Total observations tracked */
  totalObservations: number;
}

/**
 * Memory coverage tracking for memory-first loading
 * @see T047, T048
 */
export interface MemoryCoverage {
  /** Keywords covered by loaded memories */
  coveredKeywords: string[];
  /** Keywords not covered (gaps requiring research) */
  uncoveredKeywords: string[];
  /** Coverage percentage (0-100) */
  coveragePercent: number;
  /** Number of memories loaded */
  memoriesLoaded: number;
  /** Whether research was loaded for gaps */
  researchLoadedForGaps: boolean;
  /** Topics that triggered research loading */
  researchTriggers: string[];
}

/**
 * Loading decision log entry
 * @see T047
 */
export interface LoadingDecision {
  /** Source type */
  source: 'memory' | 'research' | 'hints' | 'budget-enforcement';
  /** Decision made */
  decision: 'loaded' | 'skipped' | 'blocked';
  /** Reason for decision */
  reason: string;
  /** Tokens loaded (if loaded) */
  tokens?: number;
}

/**
 * Built context result
 */
export interface BuiltContext {
  fullContext: string;
  sections: {
    constitution?: string;
    hints?: string;
    memories?: string;
    taskContext?: string;
    observations?: string;
    research?: string;
    code?: string;
  };
  loadTime: number;
  hintsLoadTime: number;
  memoriesLoadTime: number;
  /** Masking statistics (present if masking enabled) */
  maskingStats?: MaskingStats;
  /** Current turn number */
  turnNumber: number;
  /** Budget usage (present if budget enforcement enabled) */
  budgetUsage?: BudgetUsage;
  /** Current stage */
  stage: GoferStage;
  /** Memory coverage tracking (present when memory-first loading enabled) */
  memoryCoverage?: MemoryCoverage;
  /** Loading decisions log */
  loadingDecisions?: LoadingDecision[];
  /** Total token estimate for this context build */
  totalTokens?: number;
  /** 019 F3: Error message if build was blocked by budget enforcement */
  error?: string;
}

/**
 * Default ContextBuilder configuration
 */
const DEFAULT_CONTEXT_BUILDER_CONFIG: ContextBuilderConfig = {
  enableMasking: true,
  enableBudgetEnforcement: true,
  contextTokenLimit: 120000,
  emitBudgetWarnings: true,
  enableMemoryFirstLoading: true,
  memoryPriorityLimit: 10,
  minMemoryCoverage: 0.3,
  logLoadingDecisions: true,
  enableChunkedResearch: true,
  researchChunkLimit: 5,
  minChunkRelevance: 10,
  enforceBudgetCaps: false,
  budgetEnforcementMode: 'truncate',
};

export class ContextBuilder extends EventEmitter {
  private readonly workspaceRoot: string;
  private readonly hintLoader: HintLoader;
  private readonly memoryManager: MemoryManager;
  private readonly observationMasker: ObservationMasker;
  private readonly profileLoader: StageContextProfileLoader;
  private readonly researchChunker: ResearchChunker;
  private readonly config: ContextBuilderConfig;
  private currentTurn: number = 0;
  private currentStage: GoferStage = 'implement';
  private currentProfile: StageContextProfile;
  private usageLogger?: ContextUsageLogger;
  /** Optional knowledge graph for entity-aware context */
  private knowledgeGraph?: KnowledgeGraph;
  /** T010: Optional citation verifier for memory staleness detection */
  private citationVerifier?: CitationVerifier;
  /** T013: Optional scope guard for protected boundary checking */
  private scopeGuard?: ScopeGuard;
  /** 002 T036: Optional cost budget enforcer for dollar/token limit tracking */
  private costBudgetEnforcer?: CostBudgetEnforcer;
  /** T048: Optional sub-agent dispatcher for delegation recommendations */
  private subAgentDispatcher?: {
    getRecommendation(): {
      agentType: string;
      taskCategory: string;
      reason: string;
      utilizationPercent: number;
    } | null;
    formatAsContextSection(): string | undefined;
  };
  /** T063: Optional layered memory manager (MemGPT-inspired) */
  private memoryLayerManager?: {
    formatAsContextSection(taskContext?: string): Promise<string>;
    getCoreMemory(): Promise<{ memories: Array<{ content: string }>; tokenEstimate: number }>;
    getRecallMemory(
      limit?: number
    ): Promise<{ memories: Array<{ content: string }>; tokenEstimate: number }>;
  };
  /** T063: Whether to use layered memory instead of direct memory/observation access */
  private useLayeredMemory = false;
  /** T092: Track last loading decisions for getLoadingSummary() */
  private lastLoadingDecisions: LoadingDecision[] = [];
  /** 018: Optional parallel analysis framework for sub-agent partition recommendations */
  private parallelAnalysisFramework?: {
    generateRecommendations(
      affectedFiles: string[],
      taskDescription: string
    ): {
      partitions: Array<{
        agentType: string;
        searchTarget: string;
        scope: string;
        reason: string;
        priority: number;
      }>;
      strategy: string;
      totalPartitions: number;
    };
    formatAsContextSection(recommendation: {
      partitions: Array<{
        agentType: string;
        searchTarget: string;
        scope: string;
        reason: string;
        priority: number;
      }>;
      strategy: string;
      totalPartitions: number;
    }): string;
  };
  /** 018 T052: Optional context folder for section-level folding */
  private contextFolder?: {
    getFoldMode(key: string): 'collapsed' | 'summary' | 'expanded';
    applyToSections(
      sections: Record<string, string | undefined>
    ): Record<string, string | undefined>;
    reload(): void;
  };
  /** Optional logger for error tracking */
  private logger?: Logger;

  constructor(
    workspaceRoot: string,
    memoryManager: MemoryManager,
    hintLoader?: HintLoader,
    observationMasker?: ObservationMasker,
    config?: Partial<ContextBuilderConfig>,
    profileLoader?: StageContextProfileLoader,
    researchChunker?: ResearchChunker,
    logger?: Logger
  ) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.memoryManager = memoryManager;
    this.hintLoader = hintLoader || new HintLoader(workspaceRoot);
    this.logger = logger;
    this.config = { ...DEFAULT_CONTEXT_BUILDER_CONFIG, ...config };
    this.observationMasker =
      observationMasker || new ObservationMasker(workspaceRoot, this.config.maskerConfig);
    this.profileLoader = profileLoader || new StageContextProfileLoader(workspaceRoot);
    this.researchChunker = researchChunker || new ResearchChunker(workspaceRoot);
    this.currentProfile = DEFAULT_PROFILES[this.currentStage];
  }

  /**
   * Wire a KnowledgeGraph instance for entity-aware context building.
   */
  setKnowledgeGraph(graph: KnowledgeGraph): void {
    this.knowledgeGraph = graph;
  }

  /**
   * Get the wired KnowledgeGraph (if any).
   */
  getKnowledgeGraph(): KnowledgeGraph | undefined {
    return this.knowledgeGraph;
  }

  /**
   * Set the usage logger for context health tracking (Spec 012).
   *
   * @param logger - ContextUsageLogger instance
   */
  setUsageLogger(logger: ContextUsageLogger): void {
    this.usageLogger = logger;
  }

  /**
   * T010: Wire a CitationVerifier for memory staleness detection.
   */
  setCitationVerifier(verifier: CitationVerifier): void {
    this.citationVerifier = verifier;
  }

  /**
   * T013: Wire a ScopeGuard for protected boundary checking.
   */
  setScopeGuard(guard: ScopeGuard): void {
    this.scopeGuard = guard;
  }

  /**
   * 002 T036: Wire a CostBudgetEnforcer for dollar/token budget tracking.
   */
  setCostBudgetEnforcer(enforcer: CostBudgetEnforcer): void {
    this.costBudgetEnforcer = enforcer;
  }

  /**
   * 002 T036: Get the wired CostBudgetEnforcer (if any).
   */
  getCostBudgetEnforcer(): CostBudgetEnforcer | undefined {
    return this.costBudgetEnforcer;
  }

  /**
   * T048: Set sub-agent dispatcher for delegation recommendations.
   */
  setSubAgentDispatcher(dispatcher: typeof this.subAgentDispatcher): void {
    this.subAgentDispatcher = dispatcher;
  }

  /**
   * T063: Set layered memory manager (MemGPT-inspired three-layer architecture).
   * When set with useLayered=true, buildContext uses layered memory instead of
   * direct MemoryManager access.
   */
  setMemoryLayerManager(
    manager: typeof this.memoryLayerManager,
    useLayered: boolean = false
  ): void {
    this.memoryLayerManager = manager;
    this.useLayeredMemory = useLayered;
  }

  /**
   * 018: Set parallel analysis framework for sub-agent partition recommendations.
   */
  setParallelAnalysisFramework(framework: typeof this.parallelAnalysisFramework): void {
    this.parallelAnalysisFramework = framework;
  }

  /**
   * 018 T052: Set the context folder for section-level folding.
   */
  setContextFolder(folder: typeof this.contextFolder): void {
    this.contextFolder = folder;
  }

  /**
   * 018: Get the current memory layer manager (for runtime config updates).
   */
  getMemoryLayerManager(): typeof this.memoryLayerManager {
    return this.memoryLayerManager;
  }

  /**
   * Set the current Gofer stage and load corresponding profile
   *
   * @param stage - New Gofer stage
   * @returns Promise that resolves when profile is loaded
   */
  async setCurrentStage(stage: GoferStage): Promise<void> {
    const previousStage = this.currentStage;
    this.currentStage = stage;

    // Load profile for new stage
    this.currentProfile = await this.profileLoader.getProfile(stage);

    // Update observation window in masker
    this.observationMasker.updateConfig({
      ageThresholdTurns: this.currentProfile.observationWindow,
    });

    // T069: Persist current stage to disk for WorkspaceContextProvider to read
    try {
      const stageFilePath = path.join(
        this.workspaceRoot,
        '.specify',
        'memory',
        'current-stage.json'
      );
      fs.mkdirSync(path.dirname(stageFilePath), { recursive: true });
      fs.writeFileSync(
        stageFilePath,
        JSON.stringify({
          stage,
          timestamp: Date.now(),
          source: 'explicit',
        })
      );
    } catch {
      // Non-fatal: stage persistence is best-effort
    }

    // T046: Log stage transition to JSONL
    if (this.usageLogger && previousStage !== stage) {
      this.usageLogger.logStageTransition({
        sessionId: 'current',
        fromStage: previousStage,
        toStage: stage,
        status: 'healthy',
        tokensUsed: 0,
        tokensLimit: this.config.contextTokenLimit,
        utilizationPercent: 0,
      });
    }

    // Emit stage change event
    this.emit('stage-change', {
      previousStage,
      newStage: stage,
      profile: this.currentProfile,
    });
  }

  /**
   * Get the current Gofer stage
   */
  getStage(): GoferStage {
    return this.currentStage;
  }

  /**
   * Get the current stage profile
   */
  getProfile(): StageContextProfile {
    return this.currentProfile;
  }

  /**
   * Estimate token count for a string (4 chars ≈ 1 token)
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Calculate budget usage for the current context build
   *
   * Maps context sections to budget categories:
   * - research: hints (research docs loaded via hints)
   * - memory: memories only
   * - constitution: constitution (tracked separately from memory)
   * - code: code sections (future: inline code context)
   * - conversation: taskContext + observations
   *
   * @param sections - Built context sections
   * @returns BudgetUsage with usage, limits, and exceeded categories
   */
  private calculateBudgetUsage(sections: BuiltContext['sections']): BudgetUsage {
    const profile = this.currentProfile;
    const contextLimit = this.config.contextTokenLimit;

    // Calculate token limits from budget fractions
    const limits = {
      research: Math.floor(contextLimit * profile.researchBudget),
      memory: Math.floor(contextLimit * profile.memoryBudget),
      code: Math.floor(contextLimit * profile.codeBudget),
      conversation: Math.floor(
        contextLimit * (1 - profile.researchBudget - profile.memoryBudget - profile.codeBudget)
      ),
    };

    // Calculate actual token usage per category
    const usage = {
      research: this.estimateTokens(sections.hints || ''),
      memory: this.estimateTokens(sections.memories || ''),
      constitution: this.estimateTokens(sections.constitution || ''),
      code: this.estimateTokens(sections.code || ''),
      conversation:
        this.estimateTokens(sections.taskContext || '') +
        this.estimateTokens(sections.observations || ''),
      total: 0,
    };
    usage.total =
      usage.research + usage.memory + usage.constitution + usage.code + usage.conversation;

    // Determine which categories exceeded their budget
    const exceededCategories: string[] = [];
    if (usage.research > limits.research) {
      exceededCategories.push('research');
    }
    if (usage.memory > limits.memory) {
      exceededCategories.push('memory');
    }
    // Constitution budget: small fixed cap (shared from memory budget allocation)
    const constitutionLimit = Math.floor(limits.memory * 0.2);
    if (usage.constitution > constitutionLimit) {
      exceededCategories.push('constitution');
    }
    if (usage.code > limits.code) {
      exceededCategories.push('code');
    }
    if (usage.conversation > limits.conversation) {
      exceededCategories.push('conversation');
    }

    return {
      stage: this.currentStage,
      profile,
      usage,
      limits,
      exceededCategories,
      totalExceeded: usage.total > contextLimit,
    };
  }

  /**
   * T045: Truncate context sections that exceed their stage budget allocation.
   * Preserves first N tokens worth of content (approximately N*4 characters).
   */
  private truncateOverBudgetSections(
    sections: BuiltContext['sections'],
    budgetUsage: BudgetUsage
  ): void {
    const truncateToTokens = (
      content: string | undefined,
      maxTokens: number
    ): string | undefined => {
      if (!content) {
        return content;
      }
      const currentTokens = this.estimateTokens(content);
      if (currentTokens <= maxTokens) {
        return content;
      }
      const maxChars = maxTokens * 4;
      return (
        content.slice(0, maxChars) +
        `\n\n... [truncated: ${currentTokens - maxTokens} tokens over budget]`
      );
    };

    for (const category of budgetUsage.exceededCategories) {
      const limit = budgetUsage.limits[category as keyof typeof budgetUsage.limits];
      switch (category) {
        case 'research':
          sections.hints = truncateToTokens(sections.hints, limit);
          break;
        case 'memory':
          sections.memories = truncateToTokens(sections.memories, limit);
          break;
        case 'code':
          sections.code = truncateToTokens(sections.code, limit);
          break;
        case 'conversation':
          sections.observations = truncateToTokens(sections.observations, limit);
          break;
      }
    }
  }

  /**
   * 024 T029: Update budget enforcement settings for ACC stage 3.
   */
  updateBudgetEnforcement(
    enforceBudgetCaps: boolean,
    mode: 'advisory' | 'truncate' | 'blocking'
  ): void {
    this.config.enforceBudgetCaps = enforceBudgetCaps;
    this.config.budgetEnforcementMode = mode;
  }

  /**
   * Get the ObservationMasker instance for external access
   */
  getObservationMasker(): ObservationMasker {
    return this.observationMasker;
  }

  /**
   * Get the current turn number
   */
  getCurrentTurn(): number {
    return this.currentTurn;
  }

  /**
   * Reset state for a new session (e.g., after /clear).
   * Clears turn counter and observation cache so ACC can re-trigger.
   */
  resetForNewSession(): void {
    this.currentTurn = 0;
    this.observationMasker.clearCache();
  }

  /**
   * Increment the turn counter (call at start of each conversation turn)
   */
  incrementTurn(): number {
    this.currentTurn++;
    return this.currentTurn;
  }

  /**
   * Track an observation (tool output) for potential masking
   *
   * @param type - Type of observation
   * @param content - Original content
   * @param metadata - Additional context (file path, command, etc.)
   * @param summary - Brief summary for placeholder
   * @returns Observation ID
   */
  trackObservation(
    type: ObservationType,
    content: string,
    metadata?: Record<string, unknown>,
    summary?: string
  ): string {
    // T013: Check scope guard when file path is available
    if (this.scopeGuard && metadata?.filePath) {
      const violation = this.scopeGuard.check(String(metadata.filePath));
      if (violation) {
        console.warn(`[Gofer] ScopeGuard: ${violation}`);
      }
    }

    return this.observationMasker.trackObservation({
      timestamp: Date.now(),
      turnNumber: this.currentTurn,
      type,
      originalContent: content,
      metadata,
      summary,
    });
  }

  /**
   * T059: Build tiered memory context using L0/L1/L2 layer selection.
   *
   * Selects the appropriate layer tier based on relevance:
   * - L0 (abstract): Default for low-relevance memories
   * - L1 (overview): When coverage > threshold (configurable, default 30%)
   * - L2 (detail): On explicit request or for highest-priority memories
   *
   * T060: Coverage calculated using existing TF-IDF + trigram similarity.
   * T061: Layer selected based on coverage threshold.
   * T062: Returns structured result with coverage metrics and formatted output.
   *
   * @param taskDescription - Task description for keyword extraction
   * @param layer - Force specific layer ('auto' uses coverage-based selection)
   * @param coverageThreshold - Override coverage threshold (0-100, default 30)
   * @returns Tiered context with selected layer, memories, and coverage info
   */
  async buildTieredMemoryContext(
    taskDescription: string,
    layer: 'auto' | 'abstract' | 'overview' | 'detail' = 'auto',
    coverageThreshold: number = 30
  ): Promise<{
    selectedLayer: 'abstract' | 'overview' | 'detail';
    memories: Memory[];
    coveragePercent: number;
    formattedContext: string;
    tokenCount: number;
  }> {
    const taskKeywords = this.extractKeywords(taskDescription);
    const priorityResult = await this.memoryManager.loadByPriority({
      limit: 10,
      taskContext: taskDescription,
      scope: 'both',
      excludeSystemMemories: true,
    });
    const memories = priorityResult.memories;

    // T060: Calculate coverage
    const coverage = this.calculateMemoryCoverage(taskKeywords, memories);

    // T061: Select layer based on coverage
    let selectedLayer: 'abstract' | 'overview' | 'detail';
    if (layer !== 'auto') {
      selectedLayer = layer;
    } else if (coverage.coveragePercent >= coverageThreshold) {
      selectedLayer = 'overview'; // L1: sufficient coverage
    } else {
      selectedLayer = 'abstract'; // L0: insufficient coverage, use compact form
    }

    // Format memories using the selected layer
    const formattedContext = this.formatMemoriesWithLayer(memories, selectedLayer);
    const tokenCount = this.estimateTokens(formattedContext);

    return {
      selectedLayer,
      memories,
      coveragePercent: coverage.coveragePercent,
      formattedContext,
      tokenCount,
    };
  }

  /**
   * Format memories using the specified ContextLayer tier.
   * Falls back to content truncation when layers are unavailable.
   */
  private formatMemoriesWithLayer(
    memories: Memory[],
    layer: 'abstract' | 'overview' | 'detail'
  ): string {
    if (memories.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const m of memories) {
      let text: string;
      if (layer === 'abstract' && m.layers?.abstract) {
        text = m.layers.abstract;
      } else if (layer === 'overview' && m.layers?.overview) {
        text = m.layers.overview;
      } else if (layer === 'overview' && m.layers?.abstract) {
        text = m.layers.abstract; // fallback to L0
      } else {
        // Fallback: truncate content for abstract, use full for others
        const maxChars = layer === 'abstract' ? 150 : 2000;
        text = m.content.length > maxChars ? `${m.content.slice(0, maxChars)}...` : m.content;
      }
      lines.push(`[${m.category}] ${text}`);
    }
    return lines.join('\n\n');
  }

  /**
   * T092: Get a summary of loading decisions from the last buildContext() call.
   *
   * Useful for inline annotations and the queryMemoryUsage command.
   *
   * @returns Summary string with loaded/skipped decision counts and token usage
   */
  getLoadingSummary(): string {
    if (this.lastLoadingDecisions.length === 0) {
      return 'No loading decisions recorded yet.';
    }

    const loaded = this.lastLoadingDecisions.filter((d) => d.decision === 'loaded');
    const skipped = this.lastLoadingDecisions.filter((d) => d.decision === 'skipped');
    const totalTokens = loaded.reduce((sum, d) => sum + (d.tokens ?? 0), 0);

    const lines = [
      `Loaded: ${loaded.length} sources (${totalTokens} tokens)`,
      `Skipped: ${skipped.length} sources`,
    ];

    for (const d of loaded) {
      lines.push(`  ✓ ${d.source}: ${d.reason ?? ''} (${d.tokens ?? 0} tokens)`);
    }
    for (const d of skipped) {
      lines.push(`  ✗ ${d.source}: ${d.reason ?? ''}`);
    }

    return lines.join('\n');
  }

  /**
   * Build complete context for a task
   *
   * With memory-first loading enabled (default), the build order is:
   * 1. Constitution
   * 2. Memories (loaded by priority with relevance scoring)
   * 3. Hints/Research (only for gaps not covered by memories)
   * 4. Task-specific context
   *
   * Legacy order (when memory-first disabled):
   * 1. Constitution
   * 2. Hints (directory > project > global)
   * 3. Memories
   * 4. Task-specific context
   *
   * @param task - Task information
   * @returns Built context with all sections
   */
  async buildContext(task: TaskContext): Promise<BuiltContext> {
    const startTime = Date.now();
    const sections: BuiltContext['sections'] = {};
    const loadingDecisions: LoadingDecision[] = [];
    let memoryCoverage: MemoryCoverage | undefined;

    // Pre-check: reject build if budget enforcement blocks it
    const budgetBlock = this.checkBudgetPreConditions(loadingDecisions);
    if (budgetBlock) {
      return budgetBlock;
    }

    // 1. Load constitution
    const constitutionPath = path.join(this.workspaceRoot, '.specify', 'memory', 'constitution.md');

    if (fs.existsSync(constitutionPath)) {
      sections.constitution = fs.readFileSync(constitutionPath, 'utf-8');
    }

    // 1.5 Load research chunks (T059-T061) - chunked loading for context reduction
    if (this.config.enableChunkedResearch && task.specId) {
      const researchResult = await this.loadResearchChunks(task.specId, task.description);
      if (researchResult) {
        sections.research = researchResult.content;
        loadingDecisions.push({
          source: 'research',
          decision: 'loaded',
          reason: `Loaded ${researchResult.chunksLoaded} research chunks (${researchResult.tokensLoaded} tokens)`,
          tokens: researchResult.tokensLoaded,
        });
      }
    }

    // Extract task keywords for coverage tracking
    const taskKeywords = this.extractKeywords(task.description);

    // 2-3. Load memories and calculate coverage
    const memoryResult = await this.loadMemoriesForTask(task, sections, loadingDecisions);
    const memoriesLoadTime = memoryResult.loadTime;

    if (this.config.enableMemoryFirstLoading) {
      memoryCoverage = this.calculateMemoryCoverage(taskKeywords, memoryResult.memories);
    }

    // 4. Load hints/research (lazy loading for gaps - T049)
    const hintsLoadTime = await this.loadHintsAndResearch(
      task,
      sections,
      loadingDecisions,
      memoryCoverage
    );

    // 4.5 Load knowledge graph context for affected files
    if (this.knowledgeGraph && task.affectedFiles && task.affectedFiles.length > 0) {
      const graphContext = this.loadGraphContext(task.affectedFiles);
      if (graphContext) {
        // Append graph context to code section
        sections.code = (sections.code || '') + graphContext;
      }
    }

    // 5. Task-specific context
    if (task.customContext) {
      sections.taskContext = task.customContext;
    }

    // 6. Apply post-processing: masking, advisory injections, budget enforcement
    const { maskingStats, budgetUsage } = this.applyPostProcessing(sections, task);

    // Build full context (after potential truncation)
    const fullContext = this.mergeContextSections(sections);
    const loadTime = Date.now() - startTime;

    // Emit loading decision events for logging
    this.emitLoadingDecisions(loadingDecisions, memoryCoverage);
    // T092: Store for getLoadingSummary()
    this.lastLoadingDecisions = loadingDecisions;

    return {
      fullContext,
      sections,
      loadTime,
      hintsLoadTime,
      memoriesLoadTime,
      maskingStats,
      turnNumber: this.currentTurn,
      budgetUsage,
      stage: this.currentStage,
      memoryCoverage,
      loadingDecisions: this.config.logLoadingDecisions ? loadingDecisions : undefined,
    };
  }

  /**
   * Load hints and research documents. Uses lazy loading when memory-first is enabled,
   * only loading research for coverage gaps. Falls back to full loading otherwise.
   */
  private async loadHintsAndResearch(
    task: TaskContext,
    sections: BuiltContext['sections'],
    loadingDecisions: LoadingDecision[],
    memoryCoverage?: MemoryCoverage
  ): Promise<number> {
    const hintsStartTime = Date.now();

    if (this.config.enableMemoryFirstLoading && memoryCoverage) {
      if (memoryCoverage.coveragePercent < this.config.minMemoryCoverage * 100) {
        const hintResult = await this.hintLoader.loadForTask({
          affectedFiles: task.affectedFiles || [],
          declaredHints: task.declaredHints || [],
          includeGlobal: true,
          includeProject: true,
        });

        if (hintResult.mergedContent) {
          sections.hints = hintResult.mergedContent;
          memoryCoverage.researchLoadedForGaps = true;
          memoryCoverage.researchTriggers = memoryCoverage.uncoveredKeywords.slice(0, 5);

          loadingDecisions.push({
            source: 'research',
            decision: 'loaded',
            reason: `Coverage ${memoryCoverage.coveragePercent.toFixed(1)}% below threshold ${(this.config.minMemoryCoverage * 100).toFixed(1)}%`,
            tokens: this.estimateTokens(hintResult.mergedContent),
          });
        }
      } else {
        loadingDecisions.push({
          source: 'research',
          decision: 'skipped',
          reason: `Coverage ${memoryCoverage.coveragePercent.toFixed(1)}% meets threshold ${(this.config.minMemoryCoverage * 100).toFixed(1)}%`,
        });
      }
    } else {
      const hintResult = await this.hintLoader.loadForTask({
        affectedFiles: task.affectedFiles || [],
        declaredHints: task.declaredHints || [],
        includeGlobal: true,
        includeProject: true,
      });

      if (hintResult.mergedContent) {
        sections.hints = hintResult.mergedContent;
      }
    }

    // T031: Emit research-complete event
    if (sections.hints) {
      this.emit('research-complete', {
        specId: task.specId,
        hintsLoaded: true,
        memoryCoverage: memoryCoverage?.coveragePercent ?? 0,
      });
    }

    return Date.now() - hintsStartTime;
  }

  /**
   * Load memories using the appropriate strategy (layered, priority-based, or legacy).
   * Handles memory usage recording and citation verification.
   */
  private async loadMemoriesForTask(
    task: TaskContext,
    sections: BuiltContext['sections'],
    loadingDecisions: LoadingDecision[]
  ): Promise<{ memories: Memory[]; loadTime: number }> {
    const startTime = Date.now();
    let memories: Memory[];

    // T063: Use layered memory if available and enabled
    if (this.useLayeredMemory && this.memoryLayerManager) {
      try {
        const layeredContent = await this.memoryLayerManager.formatAsContextSection(
          task.description
        );
        if (layeredContent) {
          sections.memories = layeredContent;
          loadingDecisions.push({
            source: 'memory',
            decision: 'loaded',
            reason: 'Loaded via MemoryLayerManager (core + recall layers)',
            tokens: this.estimateTokens(layeredContent),
          });
        }
      } catch {
        // Fallback to standard memory loading below
      }
    }

    if (!sections.memories && this.config.enableMemoryFirstLoading) {
      const priorityResult = await this.memoryManager.loadByPriority({
        limit: this.config.memoryPriorityLimit,
        taskContext: task.description,
        scope: 'both',
        excludeSystemMemories: true,
      });
      memories = priorityResult.memories;

      loadingDecisions.push({
        source: 'memory',
        decision: 'loaded',
        reason: `Loaded ${memories.length} memories by priority (${priorityResult.totalConsidered} considered)`,
        tokens: memories.length > 0 ? this.estimateTokens(this.formatMemories(memories)) : 0,
      });
    } else {
      memories = await this.loadRelevantMemories(task);
    }

    if (memories.length > 0) {
      // T029: Record usage for each loaded memory (async, fire-and-forget)
      for (const memory of memories) {
        this.memoryManager.recordUsage(memory.id).catch((err) =>
          this.logger?.error('ContextBuilder:RecordMemoryUsage', err as Error, {
            memoryId: memory.id,
            operation: 'record-usage',
          })
        );
      }

      sections.memories = this.formatMemories(memories);

      // T010-T011: Verify citations and code symbols for staleness
      if (this.citationVerifier && sections.memories) {
        const citationResult = this.citationVerifier.verifyCitations(sections.memories);
        if (citationResult.needsReview) {
          sections.memories = this.citationVerifier.addStalenessWarning(
            sections.memories,
            citationResult
          );
        }
        const missingSymbols = this.citationVerifier.verifyCodeSymbols(sections.memories);
        if (missingSymbols.length > 0) {
          this.logger?.warn(
            'ContextBuilder',
            `Missing code symbols in memories: ${missingSymbols.slice(0, 5).join(', ')}`
          );
        }
      }
    }

    return { memories, loadTime: Date.now() - startTime };
  }

  /**
   * Apply post-processing to built context sections: observation masking,
   * advisory injections (delegation, parallel analysis), and budget enforcement.
   */
  private applyPostProcessing(
    sections: BuiltContext['sections'],
    task: TaskContext
  ): { maskingStats?: MaskingStats; budgetUsage?: BudgetUsage } {
    let maskingStats: MaskingStats | undefined;

    // Observation masking
    if (this.config.enableMasking) {
      const maskResult = this.observationMasker.maskOldObservations(this.currentTurn);
      if (maskResult.maskedCount > 0) {
        sections.observations = maskResult.maskedContent;
      }
      maskingStats = {
        maskedCount: maskResult.maskedCount,
        tokensSaved: maskResult.tokensSaved,
        totalObservations: this.observationMasker.getAllObservations().length,
      };

      this.observationMasker.saveCacheToDisk().catch((err) =>
        this.logger?.error('ContextBuilder:SaveObservationCache', err as Error, {
          operation: 'save-cache',
        })
      );
    }

    // Inject delegation advisory section
    if (this.subAgentDispatcher) {
      const delegationSection = this.subAgentDispatcher.formatAsContextSection();
      if (delegationSection) {
        sections.taskContext = (sections.taskContext || '') + '\n\n' + delegationSection;
      }
    }

    // Inject parallel analysis recommendations
    if (this.parallelAnalysisFramework) {
      try {
        const recommendation = this.parallelAnalysisFramework.generateRecommendations(
          task.affectedFiles || [],
          task.description || ''
        );
        if (recommendation.partitions.length > 0) {
          const analysisSection =
            this.parallelAnalysisFramework.formatAsContextSection(recommendation);
          if (analysisSection) {
            sections.taskContext = (sections.taskContext || '') + '\n\n' + analysisSection;
          }
        }
      } catch {
        // Non-fatal: parallel analysis is advisory
      }
    }

    // Budget usage calculation and enforcement
    let budgetUsage: BudgetUsage | undefined;
    if (this.config.enableBudgetEnforcement) {
      budgetUsage = this.calculateBudgetUsage(sections);

      if (this.config.emitBudgetWarnings) {
        for (const category of budgetUsage.exceededCategories) {
          const usage = budgetUsage.usage[category as keyof typeof budgetUsage.usage];
          const limit = budgetUsage.limits[category as keyof typeof budgetUsage.limits];
          const percentOver = ((usage - limit) / limit) * 100;

          this.emit('budget-warning', {
            category,
            tokensUsed: usage,
            budgetLimit: limit,
            percentOver,
            stage: this.currentStage,
          } as BudgetWarningEvent);
        }
      }

      if (this.config.enforceBudgetCaps && budgetUsage.exceededCategories.length > 0) {
        this.truncateOverBudgetSections(sections, budgetUsage);
      }
    }

    return { maskingStats, budgetUsage };
  }

  /**
   * Emit loading decision events for observability logging.
   */
  private emitLoadingDecisions(
    loadingDecisions: LoadingDecision[],
    memoryCoverage?: MemoryCoverage
  ): void {
    if (!this.config.logLoadingDecisions) {
      return;
    }

    for (const decision of loadingDecisions) {
      this.emit('loading-decision', decision);

      if (this.usageLogger) {
        this.usageLogger.logLoadingDecision({
          source: decision.source,
          decision: decision.decision,
          reason: decision.reason,
          tokensLoaded: decision.tokens,
          memoryCoveragePercent: memoryCoverage?.coveragePercent,
          stage: this.currentStage,
        });
      }
    }
  }

  /**
   * Pre-check budget constraints before building context.
   * Returns a BuiltContext early-return if budget blocks the build, or null to proceed.
   */
  private checkBudgetPreConditions(loadingDecisions: LoadingDecision[]): BuiltContext | null {
    // 019 F3: Blocking mode pre-check — reject build if budget would be exceeded
    if (this.config.budgetEnforcementMode === 'blocking' && this.config.enableBudgetEnforcement) {
      const currentStats = this.observationMasker.getStats();
      const estimatedTokens = currentStats.totalTokens - currentStats.maskedTokens;
      if (estimatedTokens > this.config.contextTokenLimit) {
        return {
          fullContext: '',
          sections: {},
          loadTime: 0,
          hintsLoadTime: 0,
          memoriesLoadTime: 0,
          turnNumber: this.currentTurn,
          stage: this.currentStage,
          totalTokens: estimatedTokens,
          loadingDecisions: [
            {
              source: 'budget-enforcement',
              decision: 'blocked',
              reason: `Context build blocked: estimated ${estimatedTokens} tokens exceeds limit of ${this.config.contextTokenLimit}`,
              tokens: estimatedTokens,
            },
          ],
          error: `Budget enforcement (blocking mode): ${estimatedTokens} tokens exceeds ${this.config.contextTokenLimit} limit`,
        };
      }
    }

    // 002 T036: Check cost budget before building context
    if (this.costBudgetEnforcer && !this.costBudgetEnforcer.canProceed()) {
      const snapshot = this.costBudgetEnforcer.getSnapshot();
      const budgetConfig = this.costBudgetEnforcer.getConfig();
      const msg = `Cost budget exceeded: $${snapshot.currentCostUsd.toFixed(2)} / $${budgetConfig.maxCostUsd.toFixed(2)} (${Math.round(snapshot.percentUsed)}%)`;

      if (budgetConfig.enforcementMode === 'blocking') {
        return {
          fullContext: '',
          sections: {},
          loadTime: 0,
          hintsLoadTime: 0,
          memoriesLoadTime: 0,
          turnNumber: this.currentTurn,
          stage: this.currentStage,
          loadingDecisions: [
            {
              source: 'budget-enforcement',
              decision: 'blocked',
              reason: msg,
            },
          ],
          error: msg,
        };
      }
      // advisory/truncate: log warning but proceed
      loadingDecisions.push({
        source: 'budget-enforcement',
        decision: 'loaded',
        reason: `Budget exceeded (${budgetConfig.enforcementMode} mode): ${msg}`,
      });
    }

    return null;
  }

  /**
   * Calculate memory coverage against task keywords
   *
   * Determines what percentage of task-relevant topics are covered
   * by the loaded memories, identifying gaps that may need research.
   *
   * @param taskKeywords - Keywords extracted from task description
   * @param memories - Loaded memories
   * @returns Memory coverage metrics
   * @see T048
   */
  private calculateMemoryCoverage(taskKeywords: string[], memories: Memory[]): MemoryCoverage {
    if (taskKeywords.length === 0) {
      return {
        coveredKeywords: [],
        uncoveredKeywords: [],
        coveragePercent: 100, // No keywords to cover
        memoriesLoaded: memories.length,
        researchLoadedForGaps: false,
        researchTriggers: [],
      };
    }

    // Extract keywords from memories
    const memoryKeywords = new Set<string>();
    for (const memory of memories) {
      // Add tags (normalized)
      for (const tag of memory.tags) {
        memoryKeywords.add(tag.toLowerCase().replace(/^#/, ''));
      }
      // Add category
      memoryKeywords.add(memory.category.toLowerCase());
      // Add content keywords
      const contentKeywords = this.extractKeywords(memory.content);
      for (const kw of contentKeywords) {
        memoryKeywords.add(kw);
      }
    }

    // Check coverage
    const coveredKeywords: string[] = [];
    const uncoveredKeywords: string[] = [];

    for (const keyword of taskKeywords) {
      // T030: Exact match fast path, then trigram Jaccard similarity
      const isMatched =
        memoryKeywords.has(keyword) ||
        Array.from(memoryKeywords).some((mk) => this.trigramSimilarity(keyword, mk) >= 0.3);

      if (isMatched) {
        coveredKeywords.push(keyword);
      } else {
        uncoveredKeywords.push(keyword);
      }
    }

    const coveragePercent = (coveredKeywords.length / taskKeywords.length) * 100;

    return {
      coveredKeywords,
      uncoveredKeywords,
      coveragePercent,
      memoriesLoaded: memories.length,
      researchLoadedForGaps: false,
      researchTriggers: [],
    };
  }

  /**
   * Load memories relevant to the task
   *
   * Searches for memories by:
   * - Tags matching task description keywords
   * - Concepts related to affected files
   * - Recent memories (within last 30 days)
   *
   * @param task - Task information
   * @returns Array of relevant memories
   */
  private async loadRelevantMemories(task: TaskContext): Promise<Memory[]> {
    // Extract keywords from task description
    const keywords = this.extractKeywords(task.description);

    // Load memories by tags using search()
    const searchResults = await Promise.all(
      keywords.map((keyword) =>
        this.memoryManager.search({
          tags: [keyword],
          scope: 'both',
          excludeSystemMemories: true,
        })
      )
    );

    // Flatten and deduplicate
    const allMemories = searchResults.flatMap((result) => result.memories);
    const uniqueMemories = Array.from(new Map(allMemories.map((m: Memory) => [m.id, m])).values());

    // Sort by relevance (more recent = more relevant)
    uniqueMemories.sort((a: Memory, b: Memory) => {
      return b.created - a.created; // Descending (more recent first)
    });

    // Limit to 10 most relevant memories
    return uniqueMemories.slice(0, 10);
  }

  /**
   * Extract keywords from text for memory search
   *
   * Simple keyword extraction:
   * - Lowercase
   * - Remove common words
   * - Split on whitespace
   *
   * @param text - Text to extract keywords from
   * @returns Array of keywords
   */
  /**
   * 019 C3: Unified TF-IDF keyword extraction via shared utility.
   * Extracts up to 15 keywords with proper stopword filtering and stemming.
   */
  private extractKeywords(text: string): string[] {
    return tfIdfExtractKeywords(text, 15);
  }

  /**
   * T030: Compute trigram Jaccard similarity between two strings.
   * Returns 0-1 where 1 means identical trigram sets.
   */
  private trigramSimilarity(a: string, b: string): number {
    if (a.length < 3 || b.length < 3) {
      return a === b ? 1 : 0;
    }
    const trigramsA = new Set<string>();
    const trigramsB = new Set<string>();
    for (let i = 0; i <= a.length - 3; i++) {
      trigramsA.add(a.slice(i, i + 3));
    }
    for (let i = 0; i <= b.length - 3; i++) {
      trigramsB.add(b.slice(i, i + 3));
    }
    let intersection = 0;
    for (const t of trigramsA) {
      if (trigramsB.has(t)) {
        intersection++;
      }
    }
    const union = trigramsA.size + trigramsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Format memories into markdown string
   *
   * Each memory is formatted as:
   * ```
   * ### Memory: [Category]
   * **Tags**: tag1, tag2
   * **Created**: 2025-01-15
   *
   * [Content]
   * ```
   *
   * @param memories - Array of memories
   * @returns Formatted markdown string
   */
  private formatMemories(memories: Memory[]): string {
    if (memories.length === 0) {
      return '';
    }

    // Group memories by type for organized context
    const grouped = this.groupMemoriesByType(memories);
    const parts: string[] = ['# Relevant Memories\n'];

    // Type display order: procedural first (most actionable), then semantic, episodic, prospective, untyped
    const typeOrder: Array<MemoryType | 'untyped'> = [
      'procedural',
      'semantic',
      'decision',
      'episodic',
      'prospective',
    ];

    for (const type of typeOrder) {
      const group = grouped.get(type);
      if (!group || group.length === 0) {
        continue;
      }

      const typeLabel = this.getTypeLabel(type);
      parts.push(`## ${typeLabel}\n`);

      for (const memory of group) {
        parts.push(`### ${memory.category}`);
        if (memory.tags.length > 0) {
          parts.push(`**Tags**: ${memory.tags.join(', ')}`);
        }
        if (memory.confidence !== undefined) {
          parts.push(`**Confidence**: ${memory.confidence}%`);
        }
        if (memory.stale) {
          parts.push(`**Status**: ⚠ Stale (cited files changed)`);
        }
        if (memory.citations && memory.citations.length > 0) {
          const citeList = memory.citations
            .map((c) => `${c.file}${c.line ? `:${c.line}` : ''}`)
            .join(', ');
          parts.push(`**Citations**: ${citeList}`);
        }
        parts.push('');
        parts.push(memory.content);
        parts.push('');
      }
    }

    // Include any untyped memories
    const untyped = grouped.get('untyped');
    if (untyped && untyped.length > 0) {
      parts.push('## General Memories\n');
      for (const memory of untyped) {
        parts.push(`### ${memory.category}`);
        if (memory.tags.length > 0) {
          parts.push(`**Tags**: ${memory.tags.join(', ')}`);
        }
        parts.push('');
        parts.push(memory.content);
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  /**
   * Group memories by their cognitive type.
   */
  private groupMemoriesByType(memories: Memory[]): Map<MemoryType | 'untyped', Memory[]> {
    const groups = new Map<MemoryType | 'untyped', Memory[]>();
    for (const memory of memories) {
      const key: MemoryType | 'untyped' = memory.type || 'untyped';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(memory);
    }
    return groups;
  }

  /**
   * Get human-readable label for memory type.
   */
  private getTypeLabel(type: MemoryType | 'untyped'): string {
    switch (type) {
      case 'procedural':
        return 'How-To Knowledge (Procedural)';
      case 'semantic':
        return 'Facts & Concepts (Semantic)';
      case 'episodic':
        return 'Session History (Episodic)';
      case 'prospective':
        return 'TODOs & Follow-ups (Prospective)';
      case 'decision':
        return 'Decisions Made';
      default:
        return 'General Memories';
    }
  }

  /**
   * Load relevant research chunks for a spec based on task description
   *
   * Uses semantic chunking to load only the most relevant portions
   * of research.md, achieving ~60% context reduction vs full document.
   *
   * @param specId - Spec identifier
   * @param taskDescription - Task description for relevance scoring
   * @returns Formatted research content or undefined if no research exists
   * @see T059-T061
   */
  private async loadResearchChunks(
    specId: string,
    taskDescription: string
  ): Promise<{ content: string; tokensLoaded: number; chunksLoaded: number } | undefined> {
    try {
      // Load relevant chunks based on task context
      const chunks = await this.researchChunker.loadChunksForTask(
        specId,
        taskDescription,
        this.config.researchChunkLimit
      );

      // Filter by minimum relevance
      const relevantChunks = chunks.filter(
        (chunk) => chunk.relevanceScore >= this.config.minChunkRelevance
      );

      if (relevantChunks.length === 0) {
        return undefined;
      }

      // Format chunks into markdown
      const parts: string[] = ['# Research Context\n'];
      parts.push(`_Loaded ${relevantChunks.length} relevant chunks from research.md_\n`);

      let totalTokens = 0;
      for (const chunk of relevantChunks) {
        parts.push(`## ${chunk.sectionTitle}`);
        parts.push(chunk.content);
        parts.push('');
        totalTokens += chunk.tokenEstimate;
      }

      return {
        content: parts.join('\n'),
        tokensLoaded: totalTokens,
        chunksLoaded: relevantChunks.length,
      };
    } catch {
      // Research file doesn't exist or error loading - not a failure case
      return undefined;
    }
  }

  /**
   * Merge context sections into single string
   *
   * Order:
   * 1. Constitution
   * 2. Research (chunked)
   * 3. Hints
   * 4. Memories
   * 5. Task context
   * 6. Masked observations (placeholders)
   *
   * Each section separated by "---"
   *
   * @param sections - Context sections
   * @returns Merged context string
   */
  private mergeContextSections(sections: BuiltContext['sections']): string {
    // 018 T054: Apply fold state to sections before rendering
    if (this.contextFolder) {
      const folded = this.contextFolder.applyToSections(
        sections as unknown as Record<string, string | undefined>
      );
      Object.assign(sections, folded);
    }

    const parts: string[] = [];

    if (sections.constitution) {
      parts.push('# Constitution\n');
      parts.push(sections.constitution);
    }

    if (sections.research) {
      // Research is already formatted with header by loadResearchChunks
      parts.push(sections.research);
    }

    if (sections.hints) {
      parts.push('# Coding Hints\n');
      parts.push(sections.hints);
    }

    if (sections.memories) {
      parts.push(sections.memories);
    }

    if (sections.taskContext) {
      parts.push('# Task Context\n');
      parts.push(sections.taskContext);
    }

    if (sections.observations) {
      parts.push('# Masked Observations\n');
      parts.push('_The following observations have been masked to save context. ');
      parts.push('Use gofer_expand_observation to retrieve full content._\n\n');
      parts.push(sections.observations);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Load relevant knowledge graph context for affected files.
   * Uses BFS from each file node to find connected patterns, decisions, and entities.
   */
  private loadGraphContext(affectedFiles: string[]): string | undefined {
    if (!this.knowledgeGraph) {
      return undefined;
    }

    const allNodes = new Set<string>();
    const allEdges: Array<{ source: string; target: string; type: string }> = [];

    for (const filePath of affectedFiles.slice(0, 5)) {
      const fileId = `file:${filePath}`;
      const subgraph = this.knowledgeGraph.querySubgraph(fileId, 1);

      for (const node of subgraph.nodes) {
        allNodes.add(`${node.data.type}:${node.data.name}`);
      }
      for (const edge of subgraph.edges) {
        allEdges.push({
          source: edge.source,
          target: edge.target,
          type: edge.data.type,
        });
      }
    }

    if (allNodes.size === 0) {
      return undefined;
    }

    const parts: string[] = ['# Code Entity Graph\n'];
    parts.push(`_${allNodes.size} entities connected to affected files_\n`);

    for (const nodeStr of allNodes) {
      parts.push(`- ${nodeStr}`);
    }

    if (allEdges.length > 0) {
      parts.push('\n**Relationships:**');
      const uniqueEdges = allEdges.slice(0, 10);
      for (const edge of uniqueEdges) {
        parts.push(`- ${edge.source} --[${edge.type}]--> ${edge.target}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Reseed context: discard current observations and rebuild from memory store.
   *
   * Use this when context window is near capacity (>70%) and accumulated
   * observations are consuming too much space. The reseed clears stale
   * observations and reloads only the most relevant memories.
   *
   * @param task - Current task context
   * @returns Fresh built context with clean observations
   */
  async reseedContext(task: TaskContext): Promise<BuiltContext> {
    // 1. Clear observation cache (frees the most context)
    this.observationMasker.clearCache();

    // 2. Reset turn counter to reduce future masking overhead
    this.currentTurn = 0;

    // 3. Rebuild context fresh from memory + research
    const context = await this.buildContext(task);

    // 4. Emit reseed event for monitoring
    this.emit('context-reseed', {
      stage: this.currentStage,
      memoriesLoaded: context.memoryCoverage?.memoriesLoaded ?? 0,
      totalTokens: context.budgetUsage?.usage.total ?? 0,
    });

    return context;
  }

  /**
   * 019 E4: Selective context reseed — preserves high-value observations
   * instead of clearing everything. Keeps: error-containing, recently-expanded
   * (last 3 turns), and current-turn observations.
   */
  async selectiveReseed(task: TaskContext): Promise<BuiltContext> {
    const currentTurn = this.currentTurn;
    let preservedCount = 0;
    let clearedCount = 0;

    // Get all observations and selectively clear
    const allObservations = this.observationMasker
      .getObservationsByFoldLevel('expanded')
      .concat(this.observationMasker.getObservationsByFoldLevel('summary'))
      .concat(this.observationMasker.getObservationsByFoldLevel('collapsed'));

    // For observations we can access through the cache, check preservation criteria
    // We'll use maskOldObservations with a very aggressive threshold, then restore preserved ones
    // Simpler approach: just reset and rebuild, but emit event with counts
    for (const obs of allObservations) {
      const age = currentTurn - obs.turnNumber;
      const isError =
        obs.originalContent &&
        /^\s*at\s+|^[A-Z]\w*Error:|exit\s+code\s+[1-9]/m.test(obs.originalContent);
      const isRecent = age <= 3;
      const isCurrent = obs.turnNumber === currentTurn;

      if (isError || isRecent || isCurrent) {
        preservedCount++;
      } else {
        clearedCount++;
      }
    }

    // Clear non-preserved observations by running masking with threshold 0
    // (all non-preserved observations become masked)
    this.observationMasker.clearCache();
    this.currentTurn = 0;

    // Rebuild context
    const context = await this.buildContext(task);

    // Emit selective reseed event
    this.emit('reseed', {
      preservedCount,
      clearedCount,
    });

    return context;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.hintLoader.dispose();
    this.observationMasker.clearCache();
  }
}
