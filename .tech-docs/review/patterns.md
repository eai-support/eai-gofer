---
generated: true
generated_at: '2026-05-23T17:54:39.953Z'
source_commit: '047baa06f9bdd86354d43413563a98f893685fb3'
---

# Patterns and Tech Debt

## Design Patterns Identified

### 1. Dependency Injection (tsyringe)

**Pattern:** Constructor injection with decorators

**Location:**

- `extension/src/di/index.ts` - Container exports
- `extension/src/di/container.ts` - Container setup (actual implementation)
- `extension/src/services/` - Service definitions
- Used throughout extension codebase

**Implementation:**

```typescript
// Service definition
@injectable()
class ContextBuilder {
  constructor(
    @inject(Logger) private logger: Logger,
    @inject(MemoryManager) private memory: MemoryManager
  ) {}
}

// Container registration (in di/container.ts)
export function registerServices(): void {
  container.register(Logger, { useClass: Logger });
  container.register(ContextBuilder, { useClass: ContextBuilder });
}

// Resolution
const container = getContainer();
const builder = container.resolve(ContextBuilder);
```

**Strengths:**

- ✅ Clear dependency graph
- ✅ Easy to test (mock injection)
- ✅ Centralized container management in `di/container.ts`
- ✅ Follows SOLID principles
- ✅ Services properly exported via `services/index.ts`

**Usage Examples:**

- `extension/src/services/Logger.ts`
- `extension/src/services/StateManager.ts`
- `extension/src/services/DisposalService.ts`
- `extension/src/services/InitializationService.ts`
- `extension/src/goferMigrator.ts` - resolves services from container

**Weakness:**

- ⚠️ Some services still use legacy patterns (not all migrated to DI)
- ⚠️ `reflect-metadata` import in `extension.ts` is critical but easy to forget

---

### 2. Provider Pattern (VSCode TreeDataProvider)

**Pattern:** Tree view data providers with refresh events

**Location:**

- `extension/src/progressProvider.ts` - Spec tree
- `extension/src/constitutionProvider.ts` - Constitution tree
- `extension/src/memoryProvider.ts` - Memory tree
- `extension/src/contextWindowProvider.ts` - Context health

**Implementation:**

```typescript
class ProgressProvider implements vscode.TreeDataProvider<SpecItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SpecItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SpecItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SpecItem): Promise<SpecItem[]> {
    // Return tree structure
  }
}
```

**Strengths:**

- ✅ Consistent pattern across all tree views
- ✅ Reactive updates via EventEmitter
- ✅ Leverages VSCode platform features

---

### 3. Observer Pattern (Event Emitters)

**Pattern:** Event-driven state updates

**Location:**

- `extension/src/autonomous/ContextHealthMonitor.ts`
- `extension/src/autonomous/HookBridgeWatcher.ts`
- Used extensively for cross-component communication

**Implementation:**

```typescript
class ContextHealthMonitor {
  private _onDidChangeHealth = new vscode.EventEmitter<ContextHealth>();
  readonly onDidChangeHealth = this._onDidChangeHealth.event;

  updateHealth(health: ContextHealth) {
    this._onDidChangeHealth.fire(health);
  }
}

// Consumers subscribe
monitor.onDidChangeHealth((health) => {
  statusBar.updateHealth(health);
});
```

**Strengths:**

- ✅ Decoupled components
- ✅ Reactive UI updates
- ✅ Type-safe events

**Usage Examples:**

- Spec refresh events
- Context health updates
- Memory compaction triggers
- Cost budget alerts

---

### 4. Strategy Pattern (Memory Layers)

**Pattern:** Pluggable memory storage strategies

**Location:**

- `extension/src/autonomous/MemoryLayerManager.ts`
- Three layers: Core, Recall, Archival

**Implementation:**

```typescript
interface MemoryLayer {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  search(query: string): Promise<string[]>;
}

class CoreLayer implements MemoryLayer { ... }
class RecallLayer implements MemoryLayer { ... }
class ArchivalLayer implements MemoryLayer { ... }
```

**Strengths:**

- ✅ Flexible storage backends
- ✅ MemGPT-inspired architecture
- ✅ Easy to add new layers

**Usage:**

- Core: Always-loaded high-priority memories
- Recall: Recent session context (last 20 interactions)
- Archival: Long-term searchable storage

---

### 5. Command Pattern

**Pattern:** Encapsulated command execution

**Location:**

- `extension/src/extension.ts` - 30+ command registrations
- `extension/src/commands/` - Command implementations

**Implementation:**

```typescript
commands.registerCommand('gofer.initialize', async () => {
  await initializationService.initializeRepository();
});

commands.registerCommand('gofer.refreshSpecs', async () => {
  progressProvider.refresh();
});
```

**Strengths:**

- ✅ Consistent pattern for all commands
- ✅ Easy to add new commands
- ✅ Keyboard shortcut integration

**Command Categories:**

- Repository management
- Specification CRUD
- Memory operations
- Claude Code integration
- Quality checks

---

### 6. Singleton Pattern (DI Container)

**Pattern:** Single instance per service

**Location:**

- `extension/src/di.ts`
- `extension/src/services/`

**Implementation:**

```typescript
export function getContainer(): DependencyContainer {
  return container; // Global singleton
}

// Services registered as singletons
container.register(
  Logger,
  { useClass: Logger },
  { lifecycle: Lifecycle.Singleton }
);
```

**Strengths:**

- ✅ Shared state management
- ✅ Consistent service access
- ✅ Memory efficient

**Usage:**

- Logger - Centralized logging
- StateManager - Extension state
- ConfigManager - Configuration access

---

### 7. Factory Pattern

**Pattern:** Object creation abstraction

**Location:**

- `extension/src/autonomous/LLMProvider.ts`
- Creates different LLM client instances

**Implementation:**

```typescript
class LLMProviderFactory {
  create(provider: string): LLMClient {
    switch (provider) {
      case 'anthropic':
        return new AnthropicClient();
      case 'google':
        return new GoogleClient();
      case 'openai':
        return new OpenAIClient();
    }
  }
}
```

**Strengths:**

- ✅ Unified interface for multiple providers
- ✅ Easy to add new providers
- ✅ Runtime provider switching

**Usage:**

- Provider-model routing across Claude, Codex, Copilot, and legacy Gemini
  settings; this is separate from the six current Gofer install hosts
- Cost and model-policy guidance per provider
- Rate-limit and credential-error handling

---

### 8. Repository Pattern (Spec Loading)

**Pattern:** Data access abstraction

**Location:**

- `language-server/src/utils/goferLoader.ts`
- `extension/src/autonomous/SpecLoader.ts`

**Implementation:**

```typescript
class SpecRepository {
  async loadSpec(feature: string): Promise<Spec> {
    const content = await fs.readFile(path);
    return this.parse(content);
  }

  async saveSpec(spec: Spec): Promise<void> {
    const content = this.serialize(spec);
    await fs.writeFile(path, content);
  }
}
```

**Strengths:**

- ✅ Separates data access from business logic
- ✅ Caching layer possible
- ✅ Easy to swap storage backend

---

## Anti-Patterns Found

### 1. God Object / Mega-File Anti-Pattern (CRITICAL)

**Locations:** Multiple files exceed industry best practices

**Mega-Files Identified:**

- `extension/src/services/migration/ResourceSyncer.ts` - **1787 lines**
- `extension/src/autonomous/ContextBuilder.ts` - **1787 lines**
- `extension/src/autonomousCommands.ts` - **1637 lines**
- `extension/src/autonomous/MemoryManager.ts` - **1372 lines**
- `extension/src/autonomous/AutonomousDriver.ts` - **1299 lines**
- `extension/src/extension.ts` - **1269 lines**
- `extension/src/ui/ContextContentPanel.ts` - **1218 lines**
- `extension/src/autonomous/ObservationMasker.ts` - **1215 lines**
- **Top 20 files average 1100+ lines each**

**Issues:**

- Violates Single Responsibility Principle
- Handles initialization, commands, events, disposal, business logic in one file
- Extremely high cognitive complexity
- Nearly impossible to review in PRs (GitHub limits large diffs)

**Impact:** CRITICAL

- **Hard to test in isolation** - mocking becomes nightmare
- **Difficult to navigate** - takes minutes to find relevant code
- **Potential for bugs** - too much state to reason about
- **Onboarding barrier** - new contributors overwhelmed
- **Merge conflicts** - high probability with mega-files
- **Review difficulty** - reviewers can't hold entire file in working memory

**Recommendation:** URGENT REFACTORING REQUIRED

For `extension.ts` (1269 lines):

- Extract command handlers → `extension/src/commands/`
- Extract event handlers → `extension/src/events/`
- Keep only activation/deactivation logic in main file
- Target: <300 lines

For `ContextBuilder.ts` (1787 lines):

- Extract context loading strategies
- Extract budget enforcement logic
- Extract masking logic
- Split into: ContextBuilder (core), ContextLoader, BudgetEnforcer,
  ContextMasker
- Target: <400 lines per file

For `ResourceSyncer.ts` (1787 lines):

- Extract sync strategies per resource type
- Extract validation logic
- Extract file operations
- Target: <400 lines per file

**Estimated Effort:** 3-4 weeks for complete refactoring

---

### 2. Code Duplication (Spec Parsing)

**Location:**

- `language-server/src/utils/goferLoader.ts`
- `extension/src/autonomous/SpecLoader.ts`

**Issue:**

- Spec parsing logic duplicated between extension and language server
- Slight variations in implementation
- No shared utility package
- Both files are substantial in size

**Impact:** Medium

- Code duplication (estimated ~200+ lines)
- **Bug fixes must be applied twice** - risk of missing one
- Potential for divergence in behavior
- Maintenance burden increases over time
- Testing burden (same tests duplicated)

**Recommendation:**

- Create `@gofer/spec-parser` shared package
- Use in both extension and language server
- Single source of truth for parsing logic
- Extract common utilities: YAML parsing, frontmatter extraction, validation

**Estimated Effort:** 4-6 hours

---

### 3. Magic Numbers (Context Thresholds)

**Location:**

- `extension/src/autonomous/ContextHealthMonitor.ts` (863 lines)
- `extension/src/autonomous/AutoHandoffTrigger.ts` (1097 lines)
- `extension/src/autonomous/ACCOrchestrator.ts` (cooldownMs = 30000)

**Issue:**

- Hardcoded thresholds scattered throughout
- Example: `0.5`, `0.7`, `0.65`, `0.85`, `0.9`, `0.99` for context levels
- `30000` ms hardcoded as cooldown in ACCOrchestrator
- No centralized configuration

**Impact:** Medium

- Hard to maintain consistency across files
- No single source of truth for threshold tuning
- Difficult to experiment with different thresholds
- **Risk:** Changing threshold in one place but not others creates inconsistent
  behavior

**Recommendation:**

- Extract to `ContextThresholds` configuration class
- Document threshold rationale and empirical basis
- Make configurable via VSCode settings
- Use named constants instead of inline numbers

**Partial Mitigation in place:**

- Some thresholds configurable via VSCode settings
- Default values documented in some places
- **BUT:** Not all magic numbers are exposed to settings

**Estimated Effort:** 2-3 hours

---

### 4. Incomplete Error Handling (Large File Reads)

**Location:** `extension/src/autonomous/ContextBuilder.ts` (1787 lines)

**Issue:**

- **1787-line file** loads research files without size limits
- No timeout handling for file operations
- Could hang on massive files (e.g., multi-MB research documents)
- No graceful degradation when file is too large
- ResearchChunker exists (831 lines) but unclear if it handles all cases

**Impact:** High

- Extension could freeze VS Code UI
- Poor user experience - no feedback on why operation stalled
- No fallback behavior (e.g., skip large files, truncate, warn user)
- Memory exhaustion possible with very large spec directories

**Specific Risks:**

- Reading all research context into memory at once
- String concatenation (`+=`) compounds memory usage
- No streaming or chunked processing for large contexts

**Recommendation:**

- Add file size check before read (e.g., skip files >10MB)
- Implement streaming for large files
- Add timeout with fallback (e.g., 5 second timeout per file)
- Use ResearchChunker consistently for all large file operations
- Add user notification when files are skipped due to size

**Estimated Effort:** 4-6 hours

---

### 5. Mixed Async Patterns (Promise.then() vs async/await)

**Locations:** Found in multiple autonomous files

**Issue:**

- **8 instances** of `.then()` chains found in `extension/src/autonomous/`:
  - `MemoryStorage.ts` - write queue uses `.then()`
  - `ACCOrchestrator.ts` - summarization uses `.then()`
  - `MemoryManager.ts` - file operations use `.then()`
  - `MemoryConsolidator.ts` - staleness checks use `.then()`
  - `UsageApiClient.ts` - API calls use `.then()`
- Inconsistent with predominant async/await style used elsewhere

**Impact:** Medium

- Code inconsistency makes review harder
- Mix of styles in same file is confusing
- **Risk:** `.then()` chains easier to mishandle (missing catch, wrong scope)
- Harder to debug - stack traces less clear with `.then()`

**Recommendation:**

- Convert all `.then()` to `async/await`
- Standardize on async/await throughout codebase
- Add ESLint rule to prevent new `.then()` usage
- Exception: Write queue in MemoryStorage may need `.then()` for chaining, but
  should document why

**Estimated Effort:** 2-3 hours

**Example Refactor:**

```typescript
// Before
return Promise.resolve()
  .then(() => this.summarize())
  .then((summary) => this.writeSummary(summary));

// After
const summary = await this.summarize();
await this.writeSummary(summary);
```

---

## Tech Debt Table

| Item                                | Severity | Location                                                    | Recommendation                          | Effort    |
| ----------------------------------- | -------- | ----------------------------------------------------------- | --------------------------------------- | --------- |
| **Mega-File Anti-Pattern**          | CRITICAL | 5+ files >1200 LOC, top 2 at 1787 LOC                       | Break into focused modules (<500 LOC)   | 3-4 weeks |
| **Synchronous File Operations**     | HIGH     | 59 instances in `goferMigrator.ts`, migration services      | Convert to async fs/promises            | 1-2 days  |
| **No Concurrency Protection**       | HIGH     | `ContextBuilder.ts`, `ContextHealthMonitor.ts`              | Add mutex/lock for state mutations      | 4-6 hours |
| **Missing File Size Limits**        | HIGH     | `autonomous/ContextBuilder.ts` (1787 LOC)                   | Add size checks, streaming, timeouts    | 4-6 hours |
| **Pattern Inconsistency - Async**   | MEDIUM   | 8 .then() instances in autonomous files                     | Standardize on async/await              | 2-3 hours |
| **Pattern Inconsistency - Logging** | MEDIUM   | 20 console.log vs Logger service                            | Replace with Logger service             | 2-3 hours |
| **Spec Parsing Duplication**        | MEDIUM   | `extension/SpecLoader.ts`, `language-server/goferLoader.ts` | Create shared @gofer/spec-parser        | 4-6 hours |
| **Legacy Migration Incomplete**     | MEDIUM   | `src/orchestrator/AutonomousOrchestrator_new.ts`            | Complete migration, remove old code     | 1-2 days  |
| **Magic Number Thresholds**         | MEDIUM   | `ContextHealthMonitor.ts`, `AutoHandoffTrigger.ts`, etc.    | Extract to ContextThresholds config     | 2-3 hours |
| **No Path Traversal Checks**        | MEDIUM   | `language-server/src/utils/goferLoader.ts`                  | Add path normalization, boundary checks | 2-3 hours |
| **String Concatenation**            | LOW      | `autonomous/ContextBuilder.ts`                              | Use array join pattern                  | 1-2 hours |
| **TODO Comments Without Issues**    | LOW      | 9 TODOs found, some without issue references                | Link TODOs to issues or remove          | 1-2 hours |
| **Test Data Scattered**             | LOW      | Fixtures not consolidated                                   | Consolidate in tests/fixtures/          | 2-3 hours |
| **No Coverage Reporting in CI**     | LOW      | Coverage target exists but not enforced                     | Add coverage reports to CI              | 2-3 hours |
| **No Security Audit in CI**         | MEDIUM   | npm audit not in CI pipeline                                | Add npm audit, Dependabot               | 2-3 hours |

**Total Estimated Effort:** 6-8 weeks for all items

**Priority Order (Reflects Impact × Urgency):**

1. **Mega-File Refactoring** (CRITICAL) - Blocks all other improvements
2. **Synchronous File Ops** (HIGH) - User-visible performance impact
3. **Concurrency Protection** (HIGH) - Data corruption risk
4. **File Size Limits** (HIGH) - Prevents hangs/crashes
5. **Pattern Standardization** (MEDIUM) - Improves maintainability
6. **Legacy Migration** (MEDIUM) - Reduces confusion
7. **Security & Testing** (MEDIUM) - Proactive quality
8. **Low Priority Items** - Defer to future releases

---

## Spec vs Implementation Alignment

**Active Specs:** 1 active (030-vscode-surface-truth-cleanup), 40 archived

### Feature 030: VS Code Surface Truth Cleanup (ACTIVE)

**Spec Location:** `.specify/specs/030-vscode-surface-truth-cleanup/spec.md`

**Status:** ready (not implemented yet)

**Spec Overview:**

- Addresses documentation drift between VS Code manifest and actual
  implementation
- Focus: Command surface, configuration surface, setup paths
- Priority: P1 (Maintainer trustworthy surfaces)

**Alignment Analysis:**

- ✅ **Spec correctly identifies real problem:** Documentation and manifest
  drift is a genuine issue
- ✅ **Acknowledges current state:** Spec references 41 active specs but actual
  is 1 active + 40 archived
- ✅ **Clear acceptance criteria:** Testable requirements for command/config
  parity
- ⚠️ **Spec doesn't address mega-file problem:** Surface truth cleanup is
  important but mega-files are more urgent
- ⚠️ **May be hard to maintain:** Without addressing underlying code complexity,
  drift will recur

**Recommendation:**

- Implement spec 030 as planned
- BUT: Prioritize mega-file refactoring first to prevent future drift
- Surface truth cleanup treats symptom; mega-file refactoring treats cause

### Archived Specs Sampling (40 archived specs)

**Checked:**

- `.specify/specs/_archived/003-multi-perspective-agents/`
- `.specify/specs/_archived/020-multi-session-context-panel/`
- `.specify/specs/_archived/010-addclaudeinstructions/`

**Observations:**

- Archived specs are comprehensive (plan, research, tasks, validation reports)
- **413 total spec markdown files** in `.specify/specs/`
- Evidence of robust spec-driven development process
- Well-structured with traceability, quickstart, discovery docs

**Alignment Quality:**

- ✅ Strong spec infrastructure
- ✅ Comprehensive documentation per feature
- ⚠️ **BUT:** Implementation quality (mega-files) suggests specs aren't
  preventing tech debt accumulation

---

## Pattern Consistency Across Modules

### Consistent Patterns ✅

**Service Layer:**

- All services use dependency injection
- Consistent constructor pattern
- Clear interface definitions

**Tree Views:**

- All use `TreeDataProvider` pattern
- Consistent refresh mechanism
- Standard `getTreeItem`/`getChildren` implementation

**Commands:**

- All registered in `extension.ts`
- Consistent async/await pattern
- Standard error handling

**Event Emitters:**

- Consistent naming (`_onDidChange*` private, `onDidChange*` public)
- Type-safe event payloads
- Standard subscription pattern

### Inconsistent Patterns ⚠️

**File I/O:**

- **59 instances** of `fs.readFileSync`/`fs.writeFileSync` (synchronous)
- Most code uses async `fs/promises` or `fs.readFile`
- **Impact:** Synchronous operations block extension activation and UI
- **Recommendation:** Eliminate all sync file operations, standardize on
  `fs/promises`

**Error Handling:**

- Some functions throw, others return error objects
- No consistent error type hierarchy
- Try-catch in some places, missing in others
- **Recommendation:** Define error hierarchy and usage guidelines

**Logging:**

- **20 instances** of `console.log`/`console.warn`/`console.error`
- Most code uses Logger service from `extension/src/services/Logger.ts`
- **Impact:** Inconsistent logging, can't filter/configure console output
- **Recommendation:** Replace all console calls with Logger service exclusively

**Async Patterns:**

- **8 instances** of `.then()` chains
- Majority of code uses async/await
- **Recommendation:** Standardize on async/await, add ESLint rule

---

## Architectural Trade-offs

### Trade-off 1: Monorepo vs. Separate Repos

**Decision:** Monorepo with three main directories

**Pros:**

- ✅ Easier to coordinate changes across components
- ✅ Single version number for all components
- ✅ Shared dev dependencies

**Cons:**

- ⚠️ Larger repository size
- ⚠️ All tests run even if only one component changed

**Assessment:** Good trade-off for this project size

---

### Trade-off 2: Language Server in Extension vs. Separate

**Decision:** Include language server in extension (bundled)

**Pros:**

- ✅ Simpler installation (single VSIX)
- ✅ Version alignment guaranteed
- ✅ Easier to debug

**Cons:**

- ⚠️ Larger VSIX file
- ⚠️ Language server can't be used standalone

**Assessment:** Good trade-off for user experience

---

### Trade-off 3: File-Based Storage vs. Database

**Decision:** File-based (markdown + YAML)

**Pros:**

- ✅ Git-friendly (version control)
- ✅ Human-readable
- ✅ No database dependencies
- ✅ Portable

**Cons:**

- ⚠️ No ACID transactions
- ⚠️ Potential file conflicts with concurrent edits
- ⚠️ Slower for large datasets

**Assessment:** Correct choice for this use case

---

### Trade-off 4: Polling vs. Hook-Based Monitoring

**Decision:** Hook-based (v1.17.0)

**Pros:**

- ✅ 80% CPU reduction
- ✅ More accurate
- ✅ Real-time updates

**Cons:**

- ⚠️ More complex implementation
- ⚠️ Depends on hook infrastructure

**Assessment:** Excellent improvement in v1.17.0

---

## Refactoring Opportunities

### Opportunity 1: Extract Command Handlers

**Current:** All commands registered inline in `extension.ts`

**Proposed:**

```typescript
// extension/src/commands/initializeCommand.ts
export function registerInitializeCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.initialize', async () => {
      // Implementation
    })
  );
}
```

**Benefits:**

- Improved testability
- Better organization
- Easier to find command implementations

**Effort:** 1-2 days

---

### Opportunity 2: Unified Spec Parser Package

**Current:** Duplicated parsing in extension and language server

**Proposed:**

```typescript
// packages/spec-parser/src/index.ts
export class SpecParser {
  parse(content: string): Spec { ... }
  serialize(spec: Spec): string { ... }
}

// Used by both extension and language server
```

**Benefits:**

- Single source of truth
- Easier to maintain
- Consistent behavior

**Effort:** 4-6 hours

---

### Opportunity 3: Context Builder Optimization

**Current:** Large context strings built with concatenation

**Proposed:**

```typescript
class ContextBuilder {
  build(): string {
    const parts: string[] = [];
    parts.push(this.buildHeader());
    parts.push(this.buildResearch());
    parts.push(this.buildMemories());
    return parts.join('\n\n');
  }
}
```

**Benefits:**

- Better performance
- Lower memory usage
- Easier to debug

**Effort:** 1-2 hours

---

## Conclusion

Gofer demonstrates **good architectural intentions undermined by execution
challenges**. The use of dependency injection, event-driven architecture, and
well-known design patterns shows solid engineering foundations. However, **the
mega-file anti-pattern dominates the codebase**, creating a critical
maintainability crisis.

**Key Strengths:**

- Excellent use of TypeScript and dependency injection (tsyringe)
- Consistent provider pattern for VS Code UI components
- Repo-owned Gofer scaffold with active specs kept out of the public baseline
- Strong testing volume (270 Vitest/Playwright test files)
- Good separation of concerns at the architectural level

**Critical Weaknesses:**

- **Mega-file anti-pattern:** 5+ files exceed 1200 LOC, top 2 at 1787 LOC
- **59 synchronous file operations** block extension and UI
- **No concurrency protection** despite acknowledged race condition risks
- **Pattern inconsistency:** console.log vs Logger, .then() vs async/await
- **Tech debt accumulation:** Incomplete migrations, TODOs without issues

**Immediate Action Required:**

The **mega-file problem is an existential threat** to long-term maintainability.
Files of 1787 lines are:

- Impossible to test properly
- Impossible to review thoroughly
- Impossible to refactor safely
- Violations of every SOLID principle

**Overall Assessment:** The patterns and architecture **were production-quality
at inception, but rapid growth without refactoring discipline has created
technical debt that now threatens the project's sustainability**. The active
spec (030-vscode-surface-truth-cleanup) addresses symptoms (documentation drift)
but not the root cause (code complexity). **Recommend pausing new features for
3-4 weeks to break up mega-files before debt becomes insurmountable.**

**Prognosis:** Without immediate intervention, the codebase will become
unmaintainable within 6-12 months as files continue growing and patterns
continue diverging.
