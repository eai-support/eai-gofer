import * as vscode from 'vscode';
import { GoferParser, Spec, Task, SpecStatus, TaskStatus } from './goferParser';
import { SpecLoader } from './autonomous/SpecLoader';
import { DependencyGraph } from './autonomous/DependencyGraph';
import type { BranchSpecManager } from './branchSpecManager';
import { getWorkflowProfile } from './config/workflowProfile';
import { createDeploymentReadinessEventHandlers } from './services/enterpriseai/events/DeploymentReadinessEvents';
import { validateDeploymentReadiness } from './services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { Logger } from './utils/logger';

// Debug output channel for initialization troubleshooting
let debugChannel: vscode.OutputChannel | undefined;

const ENTERPRISE_AI_DEPLOYMENT_REQUIRED_FILES: readonly string[] = [
  'eai.runtime.json',
  '.eai/deploy-doctor.json',
];
const PRIMARY_DEPLOYMENT_KEYWORDS: readonly string[] = ['deploy', 'deployment', 'rollout'];
const DEPLOYMENT_ARTIFACT_KEYWORDS: readonly string[] = [
  'runtime',
  'contract',
  'doctor',
  'smoke',
  'eai.runtime',
  'image',
  'container',
  'helm',
  'k8s',
];

class SpecItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly spec?: Spec,
    public readonly task?: Task,
    public readonly dependencies?: string[],
    public readonly dependents?: string[]
  ) {
    super(label, collapsibleState);

    if (spec && !task) {
      // This is a spec item - show Harvey ball icon with percentage at end
      const total = spec.tasks.length;
      const completed = spec.tasks.filter((t) => t.status === 'completed').length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
      const harveyBall = this.getHarveyBall(percentage);

      // T110: Add dependency info to description
      this.description = this.getSpecStatusWithDeps(spec, percentage, dependencies);

      // T111: Add full dependency chain to tooltip
      this.tooltip = this.buildSpecTooltip(spec, dependencies, dependents);

      this.label = `${harveyBall} ${label}`; // Harvey ball at front
      this.contextValue = 'spec';
      // Add click command to show spec details
      this.command = {
        command: 'gofer.showSpecDetails',
        title: 'Show Spec Details',
        arguments: [spec],
      };
    } else if (task) {
      // This is a task item - show Harvey ball icon
      const harveyBall = this.getTaskHarveyBall(task);

      this.tooltip = task.description;
      this.description = this.getTaskDescription(task);
      this.label = `${harveyBall} ${label}`; // Harvey ball at front
      this.contextValue = 'task';
      // Add click command to show task details
      this.command = {
        command: 'gofer.showTaskDetails',
        title: 'Show Task Details',
        arguments: [task, spec],
      };
    }
  }

  /**
   * T110: Get spec status with dependency indicators
   */
  private getSpecStatusWithDeps(spec: Spec, percentage: number, dependencies?: string[]): string {
    const failed = spec.tasks.filter((t) => t.status === 'failed').length;
    const inProgress = spec.tasks.filter((t) => t.status === 'in_progress').length;
    const testing = spec.tasks.filter((t) => t.status === 'testing').length;
    const blocked = spec.tasks.filter((t) => t.status === 'blocked').length;

    const parts: string[] = [];

    // Show dependency indicator first if present
    if (dependencies && dependencies.length > 0) {
      parts.push(`→ depends on: ${dependencies.join(', ')}`);
    }

    // Show active states
    if (inProgress > 0) {
      parts.push(`${inProgress} in progress`);
    }
    if (testing > 0) {
      parts.push(`${testing} testing`);
    }
    if (blocked > 0) {
      parts.push(`${blocked} blocked`);
    }
    if (failed > 0) {
      parts.push(`${failed} failed`);
    }

    // Add percentage at the end
    parts.push(`${percentage}%`);

    return parts.join(' • ');
  }

  /**
   * T111: Build tooltip with full dependency chain
   */
  private buildSpecTooltip(spec: Spec, dependencies?: string[], dependents?: string[]): string {
    const parts: string[] = [];

    // Add spec description
    if (spec.description) {
      parts.push(spec.description);
      parts.push(''); // Empty line
    }

    // Add dependency information
    if (dependencies && dependencies.length > 0) {
      parts.push('Dependencies:');
      dependencies.forEach((dep) => {
        parts.push(`  → ${dep}`);
      });
      parts.push(''); // Empty line
    }

    // Add dependent information
    if (dependents && dependents.length > 0) {
      parts.push('Depended on by:');
      dependents.forEach((dep) => {
        parts.push(`  ← ${dep}`);
      });
    }

    return parts.join('\n');
  }

  private getHarveyBall(percentage: number): string {
    // Harvey ball representation using Unicode
    if (percentage === 0) {
      return '○'; // Empty circle
    }
    if (percentage <= 25) {
      return '◔'; // Quarter filled
    }
    if (percentage <= 50) {
      return '◑'; // Half filled
    }
    if (percentage <= 75) {
      return '◕'; // Three quarters filled
    }
    return '●'; // Full circle
  }

  private getTaskHarveyBall(task: Task): string {
    // Task Harvey balls based on status
    switch (task.status) {
      case 'completed':
        return '●'; // Full circle
      case 'in_progress':
        return '◑'; // Half filled (in progress)
      case 'testing':
        return '◕'; // Three quarters (almost done)
      case 'failed':
        return '⊗'; // Circled X
      case 'blocked':
        return '⊘'; // Circled slash
      case 'pending':
      default:
        return '○'; // Empty circle
    }
  }

  private getTaskDescription(task: Task): string {
    const parts: string[] = [];

    // Show task ID
    parts.push(task.id);

    // Show attempts if > 0
    if (task.attempts && task.attempts > 0) {
      parts.push(`Attempt ${task.attempts + 1}`);
    }

    // Show dependencies
    if (task.dependencies.length > 0) {
      parts.push(`Deps: ${task.dependencies.join(', ')}`);
    }

    // Show parallel marker
    if (task.parallel) {
      parts.push('[P]');
    }

    // Show estimated time
    if (task.estimated) {
      parts.push(task.estimated);
    }

    return parts.join(' • ');
  }
}

/**
 * Provides a tree view of spec progress (GitHub Gofer format)
 */
export class ProgressProvider implements vscode.TreeDataProvider<SpecItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SpecItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private parser: GoferParser;
  private specs: Spec[] = [];
  private loadError: string | null = null;
  private branchSpecManager?: BranchSpecManager;
  private specLoader: SpecLoader;
  private dependencyGraph: DependencyGraph;
  private workspacePath: string;
  private isLoading: boolean = true; // Start in loading state
  private loadSequence: number = 0; // Sequence number to track load operations
  private hasStartedInitialLoad: boolean = false; // Track if initial load started
  private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly taskUpdateLocks: Map<string, Promise<void>> = new Map();

  constructor(
    workspacePath: string,
    branchSpecManager?: BranchSpecManager,
    debounceMs: number = 2000
  ) {
    // Initialize debug channel once
    if (!debugChannel) {
      debugChannel = vscode.window.createOutputChannel('Gofer Debug');
    }
    this.log(`ProgressProvider created for workspace: ${workspacePath}`);

    this.workspacePath = workspacePath;
    this.branchSpecManager = branchSpecManager;
    this.debounceMs = debounceMs;
    this.parser = new GoferParser(workspacePath, branchSpecManager);
    this.specLoader = new SpecLoader(workspacePath);
    this.dependencyGraph = new DependencyGraph(workspacePath);

    // Don't start loading in constructor - let getChildren() trigger it
    // This prevents race conditions and simplifies the flow
    this.log('ProgressProvider initialized (load will start on first getChildren call)');
  }

  private readonly logger = Logger.for('ProgressProvider');

  /**
   * Log to debug output channel
   */
  private log(message: string): void {
    this.logger.debug(message);
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [Gofer] ${message}`;
    debugChannel?.appendLine(logMessage);
  }

  /**
   * Update the workspace path and branch spec manager, recreating the parser.
   * This fixes the bug where the parser retained stale references from construction.
   */
  updateWorkspace(workspacePath: string, branchSpecManager?: BranchSpecManager): void {
    this.log(`updateWorkspace called: path=${workspacePath}, hasBranchMgr=${!!branchSpecManager}`);
    this.workspacePath = workspacePath;
    this.branchSpecManager = branchSpecManager;
    this.parser = new GoferParser(workspacePath, branchSpecManager);
    this.specLoader = new SpecLoader(workspacePath);
    this.dependencyGraph = new DependencyGraph(workspacePath);
  }

  /**
   * Check if a refresh is currently debouncing
   */
  isDebouncing(): boolean {
    return this.refreshDebounceTimer !== null;
  }

  isLoadingSpecs(): boolean {
    return this.isLoading;
  }

  refresh(): void {
    // Debounce rapid refreshes to prevent tree flickering.
    // Multiple callers (git state changes, file watchers, hook events) can
    // trigger refresh() in quick succession — coalesce into a single reload.
    if (this.refreshDebounceTimer) {
      return; // Already scheduled
    }
    this.log('refresh() called — scheduling debounced load');
    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshDebounceTimer = null;
      this.triggerLoad();
    }, this.debounceMs);
  }

  /**
   * Trigger a load operation with proper sequence tracking.
   * Does NOT fire _onDidChangeTreeData before the load completes — showing
   * a brief "Loading specs..." spinner between reloads causes visible flicker.
   * The final fire in _doLoadSpecs (the finally block) is sufficient.
   */
  private triggerLoad(): void {
    // Start load - the sequence is managed inside _doLoadSpecs
    this._doLoadSpecs().catch((error) => {
      // Catch any unexpected errors that escape the try/finally
      this.log(`Unexpected error escaped _doLoadSpecs: ${error}`);
    });
  }

  getTreeItem(element: SpecItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SpecItem): Promise<SpecItem[]> {
    if (!element) {
      // Trigger initial load on first getChildren call
      if (!this.hasStartedInitialLoad) {
        this.hasStartedInitialLoad = true;
        this.log('First getChildren call - triggering initial load');
        this.triggerLoad();
      }

      // Root level - show loading state if still loading
      if (this.isLoading) {
        const loadingItem = new SpecItem('Loading specs...', vscode.TreeItemCollapsibleState.None);
        loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');
        loadingItem.tooltip = `Loading specifications from ${this.workspacePath}`;
        return [loadingItem];
      }

      // Check if .specify folder exists
      // If no .specify folder, return empty array to show welcome view with Initialize button
      if (this.loadError?.includes('.specify folder not found')) {
        return []; // Shows welcome view with "Initialize Gofer" button
      }

      // Check for other load errors
      if (this.loadError) {
        const errorItem = new SpecItem(
          `Error: ${this.loadError}`,
          vscode.TreeItemCollapsibleState.None
        );
        errorItem.iconPath = new vscode.ThemeIcon('error');
        errorItem.tooltip = `Workspace: ${this.parser['workspacePath']}\n\nError: ${this.loadError}`;
        return [errorItem];
      }

      // .specify folder exists but no specs found
      if (this.specs.length === 0) {
        const noSpecsItem = new SpecItem('No specs found', vscode.TreeItemCollapsibleState.None);
        noSpecsItem.iconPath = new vscode.ThemeIcon('info');
        noSpecsItem.tooltip = `Workspace: ${this.parser['workspacePath']}\n\nLooking for specs in: .specify/specs/\n\nCreate a spec with: Gofer: Create New Spec`;
        noSpecsItem.command = {
          command: 'gofer.createSpec',
          title: 'Create New Spec',
        };
        return [noSpecsItem];
      }

      // Sort specs by ID (numeric part) before displaying
      const sortedSpecs = [...this.specs].sort((a, b) => {
        // Extract numeric prefix from spec IDs (e.g., "001" from "001-vscode-extension")
        const aNum = parseInt(a.id.split('-')[0]) || 0;
        const bNum = parseInt(b.id.split('-')[0]) || 0;
        return aNum - bNum;
      });

      // T108-T109: Add dependency information to tree items
      return sortedSpecs.map((spec) => {
        const dependencies = this.dependencyGraph.getDependencies(spec.id);
        const dependents = this.dependencyGraph.getDependents(spec.id);

        // Extract numeric prefix from ID (e.g., "001" from "001-vscode-extension")
        // and combine with title for display (e.g., "001 - VSCode Extension")
        const numericPrefix = spec.id.match(/^(\d+)-/)?.[1];
        const displayLabel = numericPrefix ? `${numericPrefix} - ${spec.title}` : spec.title;

        return new SpecItem(
          displayLabel,
          vscode.TreeItemCollapsibleState.Expanded,
          spec,
          undefined,
          dependencies,
          dependents
        );
      });
    } else if (element.spec && !element.task) {
      // Spec level - show tasks
      return element.spec.tasks.map(
        (task) =>
          new SpecItem(task.description, vscode.TreeItemCollapsibleState.None, element.spec, task)
      );
    }

    return [];
  }

  /**
   * Internal method that performs the actual loading with proper sequence tracking
   * and guaranteed cleanup via try/finally
   */
  private async _doLoadSpecs(): Promise<void> {
    // Increment sequence FIRST - this is OUR sequence number
    const mySequence = ++this.loadSequence;
    this.log(`_doLoadSpecs starting (sequence ${mySequence}), workspace: ${this.workspacePath}`);
    this.isLoading = true;

    // Track timeout so we can clear it on early return (prevents orphaned
    // unhandled Promise rejections that were causing the persistent
    // "Loading specs timed out" error in logs)
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // If no workspace path, return immediately with error
      if (!this.workspacePath || this.workspacePath === '') {
        this.log(`No workspace path, skipping load (sequence ${mySequence})`);
        this.loadError = 'No workspace folder open';
        this.specs = [];
        return;
      }

      // Check if .specify and .specify/specs exist in this workspace
      const fs = require('fs').promises;
      const path = require('path');
      const specifyPath = path.join(this.workspacePath, '.specify');
      const specsPath = path.join(specifyPath, 'specs');

      // Check .specify folder exists
      try {
        await fs.access(specifyPath);
      } catch {
        // Check if superseded before updating state
        if (mySequence !== this.loadSequence) {
          this.log(
            `Load superseded before .specify check (sequence ${mySequence}, current ${this.loadSequence})`
          );
          return;
        }
        this.loadError = `.specify folder not found in this workspace`;
        this.specs = [];
        this.log(`.specify folder not found at ${specifyPath} (sequence ${mySequence})`);
        return;
      }

      // Check .specify/specs folder exists
      try {
        await fs.access(specsPath);
      } catch {
        // Check if superseded before updating state
        if (mySequence !== this.loadSequence) {
          this.log(
            `Load superseded before specs check (sequence ${mySequence}, current ${this.loadSequence})`
          );
          return;
        }
        // .specify exists but no specs folder - this is fine, show empty state
        this.loadError = null; // Not an error, just empty
        this.specs = [];
        this.log(`No specs folder at ${specsPath} (sequence ${mySequence})`);
        return;
      }

      // Create timeout ONLY after all early-return checks pass.
      // Previously the timeout was created at the top, so early returns left
      // an orphaned setTimeout that fired 15s later as an unhandled rejection.
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Loading specs timed out after 15 seconds')),
          15000
        );
      });

      // Load specs with timeout - dependency graph is loaded separately (non-blocking)
      // to avoid cold-start timeouts from synchronous SpecLoader re-reads
      const loadedSpecs = await Promise.race([this.parser.loadAllSpecs(), timeoutPromise]);

      // Clear timeout now that loading succeeded (prevent lingering timer)
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      // Check if superseded before updating state
      if (mySequence !== this.loadSequence) {
        this.log(
          `Ignoring stale load result (sequence ${mySequence}, current ${this.loadSequence})`
        );
        return;
      }

      this.specs = loadedSpecs;
      this.loadError = null;
      this.log(`Loaded ${this.specs.length} spec(s) from ${specifyPath} (sequence ${mySequence})`);

      // Sort specs by status and completion
      this.specs.sort((a, b) => {
        // Priority order: in_progress > ready > draft > completed > blocked
        const statusPriority: Record<SpecStatus, number> = {
          in_progress: 1,
          ready: 2,
          draft: 3,
          completed: 4,
          blocked: 5,
        };

        const aPriority = statusPriority[a.status] || 99;
        const bPriority = statusPriority[b.status] || 99;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Within same status, sort by completion percentage
        const aCompleted = a.tasks.filter((t) => t.status === 'completed').length / a.tasks.length;
        const bCompleted = b.tasks.filter((t) => t.status === 'completed').length / b.tasks.length;
        return bCompleted - aCompleted;
      });

      // Load dependency graph in background (non-critical, non-blocking)
      // This avoids cold-start timeouts since SpecLoader.getAllDependencies()
      // uses synchronous fs reads that block the event loop.
      // NOTE: We intentionally do NOT fire _onDidChangeTreeData after this
      // completes. The dependency info will appear on the next natural refresh.
      // Firing here caused a second redraw that made the tree flicker.
      this.loadDependencyGraph().catch((depError) => {
        this.log(`Failed to load dependency graph: ${depError}`);
      });

      this.log(`_doLoadSpecs completed successfully (sequence ${mySequence})`);
    } catch (error) {
      // Always clear timeout to prevent orphaned timers
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      // Check if superseded before updating state
      if (mySequence !== this.loadSequence) {
        this.log(`Ignoring stale error (sequence ${mySequence}, current ${this.loadSequence})`);
        return;
      }
      this.log(`Error loading specs (sequence ${mySequence}): ${error}`);
      this.loadError = error instanceof Error ? error.message : 'Unknown error';
      this.specs = [];
    } finally {
      // Always clear timeout to prevent orphaned timers
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // ALWAYS reset isLoading and fire event if we're still the current load
      // This is the key fix - guaranteed cleanup
      if (mySequence === this.loadSequence) {
        this.isLoading = false;
        this.log(`Finalizing load (sequence ${mySequence}): isLoading=false, firing change event`);
        this._onDidChangeTreeData.fire();
      } else {
        this.log(
          `Not finalizing superseded load (sequence ${mySequence}, current ${this.loadSequence})`
        );
      }
    }
  }

  /**
   * T106: Load dependency graph from spec frontmatter
   */
  private async loadDependencyGraph(): Promise<void> {
    try {
      // Try to load existing graph from disk
      const path = require('path');
      const graphPath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'dependency-graph.json'
      );
      const fs = require('fs').promises;

      try {
        await fs.access(graphPath);
        this.dependencyGraph = await DependencyGraph.load(this.workspacePath);
        this.log(`Loaded dependency graph from ${graphPath}`);
      } catch {
        // Graph doesn't exist, create new one
        this.dependencyGraph = new DependencyGraph(this.workspacePath);
        this.log('Created new dependency graph');
      }

      // Get all dependencies from spec frontmatter
      const allDependencies = this.specLoader.getAllDependencies();

      // Populate graph with specs and their dependencies
      for (const [specId, dependencies] of allDependencies.entries()) {
        // Add spec node if not exists
        if (!this.dependencyGraph.getSpec(specId)) {
          this.dependencyGraph.addSpec(specId);
        }

        // Add dependencies
        for (const depId of dependencies) {
          try {
            // Validate dependency exists
            if (!allDependencies.has(depId)) {
              this.log(`Spec ${specId} depends on non-existent spec ${depId}`);
              continue;
            }

            // Add dependency edge (if not already present)
            if (!this.dependencyGraph.hasDependency(specId, depId)) {
              this.dependencyGraph.addDependency(specId, depId, 'required_by', {
                reason: 'Declared in spec frontmatter',
                addedAt: Date.now(),
              });
            }
          } catch (error) {
            if (error instanceof Error && error.message.includes('cycle')) {
              this.log(`Cannot add dependency ${specId} -> ${depId}: would create cycle`);
            } else {
              this.log(`Error adding dependency ${specId} -> ${depId}: ${error}`);
            }
          }
        }
      }

      // Save updated graph
      await this.dependencyGraph.save();
      this.log('Dependency graph updated and saved');
    } catch (error) {
      this.log(`Error loading dependency graph: ${error}`);
    }
  }

  /**
   * Get the current active task (first in_progress or pending task)
   */
  getCurrentTask(): { spec: Spec; task: Task } | undefined {
    for (const spec of this.specs) {
      for (const task of spec.tasks) {
        if (task.status === 'in_progress') {
          return { spec, task };
        }
      }
    }

    // If no in_progress, find first pending with dependencies met
    for (const spec of this.specs) {
      for (const task of spec.tasks) {
        if (task.status === 'pending' && this.areDependenciesMet(spec, task)) {
          return { spec, task };
        }
      }
    }

    return undefined;
  }

  /**
   * Check if task dependencies are met
   */
  private areDependenciesMet(spec: Spec, task: Task): boolean {
    if (task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every((depId) => {
      const depTask = spec.tasks.find((t) => t.id === depId);
      return depTask && depTask.status === 'completed';
    });
  }

  /**
   * Get next available tasks (pending with dependencies met)
   */
  getNextAvailableTasks(): Array<{ spec: Spec; task: Task }> {
    const available: Array<{ spec: Spec; task: Task }> = [];

    for (const spec of this.specs) {
      for (const task of spec.tasks) {
        if (task.status === 'pending' && this.areDependenciesMet(spec, task)) {
          available.push({ spec, task });
        }
      }
    }

    return available;
  }

  /**
   * Get parallel tasks (tasks marked [P] that can run concurrently)
   */
  getParallelTasks(): Array<{ spec: Spec; task: Task }> {
    return this.getNextAvailableTasks().filter(({ task }) => task.parallel);
  }

  /**
   * Get overall progress statistics
   */
  getProgress(): {
    totalSpecs: number;
    completedSpecs: number;
    inProgressSpecs: number;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    failedTasks: number;
    blockedTasks: number;
    pendingTasks: number;
  } {
    const totalSpecs = this.specs.length;
    const completedSpecs = this.specs.filter((s) =>
      s.tasks.every((t) => t.status === 'completed')
    ).length;
    const inProgressSpecs = this.specs.filter((s) =>
      s.tasks.some((t) => t.status === 'in_progress')
    ).length;

    let totalTasks = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;
    let failedTasks = 0;
    let blockedTasks = 0;
    let pendingTasks = 0;

    for (const spec of this.specs) {
      totalTasks += spec.tasks.length;
      completedTasks += spec.tasks.filter((t) => t.status === 'completed').length;
      inProgressTasks += spec.tasks.filter((t) => t.status === 'in_progress').length;
      failedTasks += spec.tasks.filter((t) => t.status === 'failed').length;
      blockedTasks += spec.tasks.filter((t) => t.status === 'blocked').length;
      pendingTasks += spec.tasks.filter((t) => t.status === 'pending').length;
    }

    return {
      totalSpecs,
      completedSpecs,
      inProgressSpecs,
      totalTasks,
      completedTasks,
      inProgressTasks,
      failedTasks,
      blockedTasks,
      pendingTasks,
    };
  }

  /**
   * Get all specs
   */
  getSpecs(): Spec[] {
    return this.specs;
  }

  /**
   * Get spec by ID
   */
  getSpec(specId: string): Spec | undefined {
    return this.specs.find((s) => s.id === specId);
  }

  /**
   * Update task status
   */
  async updateTaskStatus(specId: string, taskId: string, status: TaskStatus): Promise<void> {
    await this.runTaskUpdateInOrder(specId, async (): Promise<void> => {
      await this.enforceEnterpriseAiDeploymentReadiness(specId, taskId, status);
      await this.parser.updateTaskStatus(specId, taskId, status);
    });
    this.refresh();
  }

  private async runTaskUpdateInOrder(
    specId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const priorLock = this.taskUpdateLocks.get(specId) ?? Promise.resolve();
    const currentUpdate = (async (): Promise<void> => {
      await priorLock;
      await operation();
    })();
    const completionSignal = currentUpdate.then(
      (): void => undefined,
      (): void => undefined
    );
    this.taskUpdateLocks.set(specId, completionSignal);

    try {
      await currentUpdate;
    } finally {
      if (this.taskUpdateLocks.get(specId) === completionSignal) {
        this.taskUpdateLocks.delete(specId);
      }
    }
  }

  private async enforceEnterpriseAiDeploymentReadiness(
    specId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<void> {
    if (status !== 'completed' || getWorkflowProfile() !== 'enterpriseai') {
      return;
    }

    const spec = this.getSpec(specId) ?? (await this.parser.loadSpec(specId));
    const task = spec.tasks.find(
      (candidateTask: Task): boolean =>
        this.normalizeTaskIdentifier(candidateTask.id) === this.normalizeTaskIdentifier(taskId)
    );
    if (!task || !this.isDeploymentTask(task)) {
      return;
    }

    const deploymentReadinessEvents = createDeploymentReadinessEventHandlers();
    deploymentReadinessEvents.consume((payload) => {
      this.logger.info('EnterpriseAI deployment readiness validated before completion', {
        specId,
        taskId: task.id,
        readinessPassed: payload.readinessPassed,
        missingFiles: payload.missingFiles,
      });
    });

    const readiness = await validateDeploymentReadiness(
      {
        runId: `progress-${specId}`,
        stage: 'implementation',
        deploymentTaskId: task.id,
        requiredFiles: ENTERPRISE_AI_DEPLOYMENT_REQUIRED_FILES,
        blockCompletionOnFailure: true,
      },
      {
        workspaceRoot: this.workspacePath,
        eventPublisher: (payload) => {
          deploymentReadinessEvents.publish(payload);
        },
      }
    );

    if (!readiness.response.deploymentTaskCompletionAllowed) {
      const missingFiles = readiness.response.missingFiles.join(', ');
      const message =
        `Cannot mark deployment task "${task.id}" complete. ` +
        `Missing required runtime contract or deploy doctor evidence files: ${missingFiles}.`;
      void vscode.window.showWarningMessage(message);
      throw new Error(`IMPL_DEPLOYMENT_VALIDATION_FAILED: ${message}`);
    }
  }

  private isDeploymentTask(task: Task): boolean {
    const searchableText = `${task.id} ${task.description}`.toLowerCase();
    const hasPrimaryKeyword = PRIMARY_DEPLOYMENT_KEYWORDS.some((keyword: string): boolean =>
      searchableText.includes(keyword)
    );
    if (hasPrimaryKeyword) {
      return true;
    }

    const hasReleaseOrPublishKeyword =
      searchableText.includes('release') || searchableText.includes('publish');
    if (!hasReleaseOrPublishKeyword) {
      return false;
    }

    const hasDeploymentArtifactKeyword = DEPLOYMENT_ARTIFACT_KEYWORDS.some(
      (keyword: string): boolean => searchableText.includes(keyword)
    );
    if (!hasDeploymentArtifactKeyword) {
      return false;
    }

    return (
      searchableText.includes('production') ||
      searchableText.includes('environment target') ||
      searchableText.includes('deployment')
    );
  }

  private normalizeTaskIdentifier(taskId: string): string {
    return taskId.replace(/^[#\[]+|[\]:]+$/g, '').toLowerCase();
  }

  /**
   * Update spec status
   */
  async updateSpecStatus(specId: string, status: SpecStatus): Promise<void> {
    await this.parser.updateSpecStatus(specId, status);
    this.refresh();
  }

  /**
   * Get dependency graph for external use
   */
  getDependencyGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  /**
   * Get impact report for a spec
   */
  getImpactReport(specId: string): ReturnType<DependencyGraph['getImpactReport']> {
    return this.dependencyGraph.getImpactReport(specId);
  }
}
