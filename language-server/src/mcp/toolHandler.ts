/**
 * MCP Tool Handler
 *
 * Handles MCP tool invocations from Claude Code or GitHub Copilot
 * via VSCode's native MCP support (1.102+)
 */

import { Connection } from 'vscode-languageserver';
import { GoferLoader, Spec, Task } from '../utils/goferLoader';
import { ValidationService } from '../utils/ValidationService';
import { TestHarnessGenerator } from '../utils/TestHarnessGenerator';
import { ResearchChunker } from '../utils/ResearchChunker';
import { execFile } from 'node:child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Type definitions for MCP tool responses
interface SpecSummary {
  id: string;
  title: string;
  status: string;
  taskCount: number;
  completedTasks: number;
  tasks: Array<{
    id: string;
    description: string;
    status: string;
    dependencies: string[];
  }>;
}

interface GetSpecsResponse {
  success: boolean;
  count?: number;
  specs?: SpecSummary[];
  error?: string;
}

interface GetNextTaskResponse {
  success?: boolean;
  spec?: Partial<Spec> | null;
  task?: Partial<Task> | null;
  message?: string;
  error?: string;
}

interface ExecuteTaskResponse {
  success?: boolean;
  spec?: Spec;
  task?: Task;
  constitution?: string;
  testHarnessPath?: string;
  error?: string;
  errorCode?: string;
  // Additive fields from enriched context bridge (Spec 013 Phase 3)
  memories?: string;
  hints?: string;
  researchChunks?: string;
  memoryCoverage?: {
    coveragePercent: number;
    memoriesLoaded: number;
    researchLoadedForGaps: boolean;
  };
}

/** Shape of the enriched context bridge file */
interface EnrichedContextBridge {
  timestamp: number;
  specId: string;
  taskId: string;
  sections: {
    constitution?: string;
    hints?: string;
    memories?: string;
    research?: string;
    /** Entity knowledge graph context for affected files */
    graphContext?: string;
    /** Code context */
    code?: string;
  };
  memoryCoverage?: {
    coveredKeywords: string[];
    uncoveredKeywords: string[];
    coveragePercent: number;
    memoriesLoaded: number;
    researchLoadedForGaps: boolean;
    researchTriggers: string[];
  };
  /** Memory type breakdown for the loaded memories */
  memoryTypes?: {
    procedural: number;
    semantic: number;
    episodic: number;
    decision: number;
    prospective: number;
    untyped: number;
  };
  budgetUsage?: Record<string, unknown>;
}

interface UpdateTaskStatusResponse {
  success: boolean;
  spec?: Spec;
  task?: Task;
  message?: string;
  error?: string;
  errorCode?: string;
}

interface ValidationIssue {
  file: string;
  line?: number;
  severity: 'error' | 'warning';
  message: string;
}

interface ValidateCodeResponse {
  success?: boolean;
  isValid?: boolean;
  files?: string[];
  issues?: ValidationIssue[];
  summary?: string;
  message?: string;
  error?: string;
}

interface TestResult {
  success?: boolean;
  passed?: boolean;
  total?: number;
  passed_count?: number;
  failed_count?: number;
  failed_tests?: string[];
  output?: string;
  message?: string;
  note?: string;
  specId?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Health Enhancement Types (spec 011)
// ─────────────────────────────────────────────────────────────────────────────

interface ObservationData {
  id: string;
  type: 'file_read' | 'command_output' | 'api_response' | 'search_result' | 'test_output';
  timestamp: number;
  turnNumber: number;
  tokenEstimate: number;
  content: string;
  metadata?: Record<string, unknown>;
}

interface ExpandObservationResponse {
  success: boolean;
  observation?: ObservationData;
  error?: string;
  errorCode?: string;
}

interface ContextHealthResponse {
  success: boolean;
  health?: {
    status: 'healthy' | 'warning' | 'critical';
    utilizationPercent: number;
    tokensUsed: number;
    tokensLimit: number;
    breakdown?: {
      specArtifacts: number;
      memories: number;
      hints: number;
      observations: number;
      systemFiles: number;
      conversation: number;
    };
    recommendations: string[];
    timestamp: number;
    // Real context monitoring fields (Spec 014 T042)
    dataSource?: 'real' | 'estimated' | 'none';
    model?: string;
    sessionId?: string;
  };
  error?: string;
}

interface ResearchChunkData {
  id: string;
  sectionTitle: string;
  content: string;
  tokenEstimate: number;
  relevanceKeywords: string[];
  order: number;
}

interface ResearchIndexResponse {
  success: boolean;
  index?: {
    sourceFile: string;
    totalTokens: number;
    chunkCount: number;
    created: number;
    chunks: Array<{
      id: string;
      title: string;
      tokens: number;
      keywords: string[];
    }>;
  };
  error?: string;
  errorCode?: string;
}

interface LoadResearchChunkResponse {
  success: boolean;
  chunk?: ResearchChunkData;
  error?: string;
  errorCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// T060/T067/T074: Observation Folding, Context REPL, Undo Types
// ─────────────────────────────────────────────────────────────────────────────

interface ObservationCacheEntry {
  id: string;
  type: 'file_read' | 'command_output' | 'api_response' | 'search_result' | 'test_output';
  timestamp: number;
  turnNumber: number;
  tokenEstimate: number;
  originalContent: string;
  keyPointsContent?: string;
  decayTier?: 'full' | 'key-points' | 'masked';
  foldLevel?: 'collapsed' | 'summary' | 'expanded';
  metadata?: Record<string, unknown>;
}

interface PeekObservationResponse {
  success: boolean;
  peek?: {
    id: string;
    type: string;
    decayTier: string;
    foldLevel?: string;
    tokenEstimate: number;
    peekContent: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
  errorCode?: string;
}

interface FoldObservationResponse {
  success: boolean;
  result?: {
    id: string;
    previousLevel: string;
    newLevel: string;
  };
  error?: string;
  errorCode?: string;
}

interface GrepObservationsResponse {
  success: boolean;
  results?: {
    pattern: string;
    totalMatches: number;
    observationsMatched: number;
    matches: Array<{
      id: string;
      type: string;
      matchCount: number;
      excerpts: string[];
      metadata?: Record<string, unknown>;
    }>;
  };
  error?: string;
  errorCode?: string;
}

interface ContextReplResponse {
  success: boolean;
  content?: string;
  section?: string;
  error?: string;
  errorCode?: string;
}

interface ContextGrepResponse {
  success: boolean;
  results?: {
    pattern: string;
    totalMatches: number;
    sectionMatches: Array<{
      section: string;
      matchCount: number;
      excerpts: string[];
    }>;
  };
  error?: string;
  errorCode?: string;
}

interface ContextHistoryResponse {
  success: boolean;
  operations?: Array<{
    type: string;
    target: string;
    detail: string;
    timestamp: number;
  }>;
  error?: string;
}

interface ContextOperation {
  type: string;
  observationId?: string;
  section?: string;
  foldLevel?: string;
  previousLevel?: string;
  timestamp: number;
}

interface TriggerHandoffResponse {
  success: boolean;
  handoff?: {
    file: string;
    created: number;
    contextSnapshot: {
      tokensUsed: number;
      utilizationPercent: number;
      completedTasks: string[];
      currentTask?: string;
      stage: string;
    };
    resumeCommand: string;
  };
  error?: string;
  errorCode?: string;
}

interface ScriptExecutionResult {
  success: boolean;
  exitCode?: number | string;
  stdout: string;
  stderr: string;
}

interface StageCommandMetadata {
  stem: string;
  name: string;
  description: string;
}

export class MCPToolHandler {
  private goferLoader: GoferLoader;
  private validationService: ValidationService;
  private testHarnessGenerator: TestHarnessGenerator;
  private researchChunker: ResearchChunker;

  constructor(
    private workspacePath: string,
    private connection: Connection
  ) {
    this.goferLoader = new GoferLoader(workspacePath);
    this.validationService = new ValidationService(workspacePath);
    this.testHarnessGenerator = new TestHarnessGenerator(workspacePath);
    this.researchChunker = new ResearchChunker(workspacePath);
  }

  /**
   * Log security violations for monitoring
   */
  private logSecurityViolation(message: string, details: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'SECURITY_VIOLATION',
      message,
      details,
      workspacePath: this.workspacePath,
    };

    // Send to stderr for proper logging (don't use console.log/warn in production)
    process.stderr.write(`🔒 Security Violation: ${JSON.stringify(logEntry)}\n`);

    // Send notification to extension for monitoring
    this.connection.sendNotification('gofer/securityViolation', logEntry);
  }

  /**
   * Validate and sanitize spec ID to prevent path traversal attacks
   */
  private validateSpecId(specId: string): { valid: boolean; error?: string } {
    if (!specId || typeof specId !== 'string') {
      this.logSecurityViolation('Invalid specId type', { specId, type: typeof specId });
      return { valid: false, error: 'specId must be a non-empty string' };
    }

    // Check for path traversal attempts
    if (specId.includes('..') || specId.includes('/') || specId.includes('\\')) {
      this.logSecurityViolation('Path traversal attempt in specId', { specId });
      return { valid: false, error: 'specId contains invalid characters (path traversal)' };
    }

    // Check for reasonable length
    if (specId.length > 100) {
      this.logSecurityViolation('SpecId exceeds maximum length', {
        specId: specId.substring(0, 50) + '...',
        length: specId.length,
      });
      return { valid: false, error: 'specId is too long (max 100 characters)' };
    }

    // Validate format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(specId)) {
      this.logSecurityViolation('Invalid characters in specId', { specId });
      return {
        valid: false,
        error: 'specId must contain only alphanumeric characters, hyphens, and underscores',
      };
    }

    return { valid: true };
  }

  /**
   * Validate task ID
   */
  private validateTaskId(taskId: string): { valid: boolean; error?: string } {
    if (!taskId || typeof taskId !== 'string') {
      this.logSecurityViolation('Invalid taskId type', { taskId, type: typeof taskId });
      return { valid: false, error: 'taskId must be a non-empty string' };
    }

    if (taskId.length > 20) {
      this.logSecurityViolation('TaskId exceeds maximum length', {
        taskId: taskId.substring(0, 10) + '...',
        length: taskId.length,
      });
      return { valid: false, error: 'taskId is too long (max 20 characters)' };
    }

    // Allow formats like "T001", "#1", "1"
    if (!/^[#]?\d+$|^[A-Z]\d+$/.test(taskId)) {
      this.logSecurityViolation('Invalid characters in taskId', { taskId });
      return { valid: false, error: 'taskId must match format: T001, #1, or 1' };
    }

    return { valid: true };
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private getServerDir(): string {
    return typeof __dirname === 'string' ? __dirname : process.cwd();
  }

  private async resolveNodeScript(scriptName: string): Promise<string | null> {
    const serverDir = this.getServerDir();
    const candidates = [
      path.join(this.workspacePath, '.specify', 'scripts', 'node', scriptName),
      path.resolve(serverDir, '..', '..', '..', 'resources', 'node-scripts', scriptName),
      path.resolve(
        serverDir,
        '..',
        '..',
        '..',
        'extension',
        'resources',
        'node-scripts',
        scriptName
      ),
      path.join(process.cwd(), 'extension', 'resources', 'node-scripts', scriptName),
      path.join(process.cwd(), '.specify', 'scripts', 'node', scriptName),
    ];

    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private normalizeHost(host?: string): string {
    const normalized = String(host || 'auto').toLowerCase();
    return ['auto', 'claude', 'codex', 'copilot', 'gemini', 'vscode'].includes(normalized)
      ? normalized
      : 'auto';
  }

  private async runCommand(
    command: string,
    args: string[],
    timeout = 60000
  ): Promise<ScriptExecutionResult> {
    const cwd = (await this.pathExists(this.workspacePath)) ? this.workspacePath : process.cwd();
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      const execError = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
      };
      return {
        success: false,
        exitCode: execError.code,
        stdout: execError.stdout || '',
        stderr: execError.stderr || execError.message || '',
      };
    }
  }

  private parseJsonFromExecution(result: ScriptExecutionResult): unknown | null {
    const payload = result.stdout.trim();
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private async readJsonIfExists(filePath: string): Promise<unknown | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      return null;
    }
  }

  private async resolveSourceDirectory(relativePath: string): Promise<string | null> {
    const candidates = [
      path.join(this.workspacePath, relativePath),
      path.join(process.cwd(), relativePath),
      path.join(process.cwd(), 'extension', 'resources', this.mapResourceDirectory(relativePath)),
    ];

    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private mapResourceDirectory(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const map: Record<string, string> = {
      '.specify/commands': 'specify-commands',
      '.specify/references': 'references',
    };
    return map[normalized] || normalized;
  }

  private normalizeCommandKey(command: string): string {
    return command
      .trim()
      .replace(/^\$+/, '')
      .replace(/^\//, '')
      .replace(/^eai-gofer:/, '')
      .toLowerCase()
      .replace(/[:/-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async loadStageCommandMetadata(): Promise<Map<string, StageCommandMetadata>> {
    const commandsDir = await this.resolveSourceDirectory(path.join('.specify', 'commands'));
    const commandMap = new Map<string, StageCommandMetadata>();
    if (!commandsDir) {
      return commandMap;
    }

    const entries = (await fs.readdir(commandsDir)).filter((entry) => entry.endsWith('.md'));
    for (const entry of entries) {
      const stem = path.basename(entry, '.md');
      const content = await fs.readFile(path.join(commandsDir, entry), 'utf-8');
      const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
      const block = frontmatter?.[1] || '';
      const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() || stem;
      const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
      const metadata = { stem, name, description };

      for (const key of [stem, name, `/${stem}`, `/${name}`]) {
        commandMap.set(this.normalizeCommandKey(key), metadata);
      }
    }

    return commandMap;
  }

  private resolveWorkspaceArtifactPath(relativePath: string): { path?: string; error?: string } {
    if (!relativePath || typeof relativePath !== 'string') {
      return { error: 'path must be a non-empty workspace-relative string' };
    }

    if (path.isAbsolute(relativePath)) {
      return { error: 'path must be workspace-relative, not absolute' };
    }

    const resolved = path.resolve(this.workspacePath, relativePath);
    const workspaceRoot = path.resolve(this.workspacePath);
    if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
      this.logSecurityViolation('Path traversal attempt in artifact path', { relativePath });
      return { error: 'path escapes workspace root' };
    }

    return { path: resolved };
  }

  async checkWorkspace(host?: string): Promise<Record<string, unknown>> {
    const script = await this.resolveNodeScript('gofer-workspace-check.mjs');
    if (!script) {
      return {
        success: false,
        status: 'missing',
        error: 'gofer-workspace-check.mjs was not found in the workspace or bundled resources',
        prompt: 'This repo is missing or stale for Gofer. Initialize/update it now?',
      };
    }

    const result = await this.runCommand('node', [
      script,
      '--workspace',
      this.workspacePath,
      '--host',
      this.normalizeHost(host),
      '--json',
    ]);
    const payload = this.parseJsonFromExecution(result);

    return {
      success: Boolean(payload),
      ...(payload && typeof payload === 'object' ? payload : {}),
      exitCode: result.exitCode,
      stderr: result.stderr || undefined,
    };
  }

  async bootstrapWorkspace(options: {
    host?: string;
    includeMirrors?: boolean;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    const script = await this.resolveNodeScript('gofer-workspace-bootstrap.mjs');
    if (!script) {
      return {
        success: false,
        status: 'missing',
        error: 'gofer-workspace-bootstrap.mjs was not found in the workspace or bundled resources',
      };
    }

    const args = [
      script,
      '--workspace',
      this.workspacePath,
      '--host',
      this.normalizeHost(options.host),
    ];
    if (options.includeMirrors ?? true) {
      args.push('--include-mirrors');
    }
    if (options.dryRun) {
      args.push('--dry-run');
    }

    const result = await this.runCommand('node', args, 120000);
    const payload = this.parseJsonFromExecution(result);

    return {
      success: Boolean(payload),
      ...(payload && typeof payload === 'object' ? payload : {}),
      exitCode: result.exitCode,
      stderr: result.stderr || undefined,
    };
  }

  async getPipelineState(): Promise<Record<string, unknown>> {
    const specsDir = path.join(this.workspacePath, '.specify', 'specs');
    const states: unknown[] = [];
    const artifacts: Record<string, string[]> = {};

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) {
          continue;
        }

        const featureDir = path.join(specsDir, entry.name);
        const state = await this.readJsonIfExists(path.join(featureDir, 'pipeline-state.json'));
        if (state) {
          states.push(state);
        }

        const featureFiles = (await fs.readdir(featureDir, { withFileTypes: true }))
          .filter((file) => file.isFile())
          .map((file) => file.name)
          .filter((file) => file.endsWith('.md') || file.endsWith('.json'))
          .sort();
        artifacts[entry.name] = featureFiles;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: true,
          active: null,
          states: [],
          artifacts: {},
          message: 'No .specify/specs directory found yet',
        };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }

    const active =
      states.find(
        (state) =>
          typeof state === 'object' &&
          state !== null &&
          (state as { status?: string }).status === 'in_progress'
      ) ||
      states[0] ||
      null;

    return { success: true, active, states, artifacts };
  }

  async startStage(command: string, feature?: string): Promise<Record<string, unknown>> {
    const commandMap = await this.loadStageCommandMetadata();
    const metadata = commandMap.get(this.normalizeCommandKey(command));
    if (!metadata) {
      return {
        success: false,
        error: `Unknown Gofer command: ${command}`,
        availableCommands: Array.from(commandMap.values())
          .map((item) => item.name)
          .sort(),
      };
    }

    const slashCommand = metadata.name.includes(':') ? `/${metadata.name}` : `/${metadata.stem}`;
    return {
      success: true,
      command: slashCommand,
      feature,
      description: metadata.description,
      preflight: {
        tool: 'gofer_check_workspace',
        promptOnMissingOrStale:
          'This repo is missing or stale for Gofer. Initialize/update it now?',
        bootstrapTool: 'gofer_bootstrap_workspace',
      },
      instruction: feature
        ? `Run ${slashCommand} ${feature} after workspace check passes.`
        : `Run ${slashCommand} after workspace check passes.`,
    };
  }

  async validateBranch(base = 'origin/main'): Promise<Record<string, unknown>> {
    const branch = await this.runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], 10000);
    const status = await this.runCommand('git', ['status', '--short'], 10000);
    const changed = await this.runCommand('git', ['diff', '--name-only', `${base}...HEAD`], 10000);

    return {
      success: branch.success,
      branch: branch.stdout.trim() || 'unknown',
      base,
      dirty: status.stdout.trim().length > 0,
      status: status.stdout.trim().split('\n').filter(Boolean),
      changedFiles: changed.stdout.trim().split('\n').filter(Boolean),
      recommendedValidation: [
        'node .specify/scripts/node/gofer-workspace-check.mjs --host auto --json',
        'npm run gofer:version-check',
        'npm run ci:test',
        '/6_gofer_validate',
      ],
      warning: changed.success
        ? undefined
        : `Could not compare against ${base}: ${changed.stderr || 'unknown git error'}`,
    };
  }

  async explainEaiError(codeOrReason: string): Promise<Record<string, unknown>> {
    if (!codeOrReason || typeof codeOrReason !== 'string') {
      return { success: false, error: 'codeOrReason is required' };
    }

    const cli = await this.runCommand(
      'eai',
      ['errors', 'explain', codeOrReason, '--format', 'json'],
      30000
    );
    const cliPayload = this.parseJsonFromExecution(cli);
    if (cli.success && cliPayload) {
      return { success: true, source: 'eai-cli', explanation: cliPayload };
    }

    const catalogPath = path.join(
      this.workspacePath,
      '.specify',
      'references',
      'platform',
      'eai-error-catalog.yaml'
    );
    let fallback = '';
    try {
      const catalog = await fs.readFile(catalogPath, 'utf-8');
      const lines = catalog.split('\n');
      const needle = codeOrReason.toLowerCase();
      const matches = lines
        .map((line, index) => ({ line, index }))
        .filter((item) => item.line.toLowerCase().includes(needle))
        .slice(0, 8)
        .map((item) => `${item.index + 1}: ${item.line}`);
      fallback = matches.join('\n');
    } catch {
      fallback = '';
    }

    return {
      success: true,
      source: fallback ? 'repo-error-catalog' : 'fallback',
      codeOrReason,
      explanation:
        fallback ||
        'Run `eai login`, confirm the active tenant with `eai whoami`, run `eai --describe`, then retry with `eai errors explain <code-or-reason> --format json` when the CLI is available.',
      cliError: cli.stderr || undefined,
    };
  }

  async openArtifact(relativePath: string, maxBytes = 20000): Promise<Record<string, unknown>> {
    const resolved = this.resolveWorkspaceArtifactPath(relativePath);
    if (resolved.error || !resolved.path) {
      return { success: false, error: resolved.error };
    }

    try {
      const content = await fs.readFile(resolved.path, 'utf-8');
      const limit = Math.max(1000, Math.min(Number(maxBytes) || 20000, 100000));
      return {
        success: true,
        path: relativePath,
        bytes: Buffer.byteLength(content, 'utf-8'),
        truncated: Buffer.byteLength(content, 'utf-8') > limit,
        content: content.slice(0, limit),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * MCP Tool: gofer_get_specs
   * Returns all specifications
   */
  async getSpecs(): Promise<GetSpecsResponse> {
    try {
      const specs = await this.goferLoader.loadAllSpecs();

      return {
        success: true,
        count: specs.length,
        specs: specs.map((spec) => ({
          id: spec.id,
          title: spec.title,
          status: spec.status,
          taskCount: spec.tasks.length,
          completedTasks: spec.tasks.filter((t) => t.status === 'completed').length,
          tasks: spec.tasks.map((t) => ({
            id: t.id,
            description: t.description,
            status: t.status,
            dependencies: t.dependencies,
          })),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * MCP Tool: gofer_get_next_task
   * Returns the next available task to work on
   */
  async getNextTask(): Promise<GetNextTaskResponse> {
    try {
      const specs = await this.goferLoader.loadAllSpecs();

      // Find first in_progress task
      for (const spec of specs) {
        for (const task of spec.tasks) {
          if (task.status === 'in_progress') {
            return {
              success: true,
              spec: {
                id: spec.id,
                title: spec.title,
                description: spec.description,
              },
              task: {
                id: task.id,
                description: task.description,
                status: task.status,
                dependencies: task.dependencies,
                attempts: task.attempts,
              },
            };
          }
        }
      }

      // Find first pending task with dependencies met
      for (const spec of specs) {
        for (const task of spec.tasks) {
          if (task.status === 'pending' && this.areDependenciesMet(spec, task)) {
            return {
              success: true,
              spec: {
                id: spec.id,
                title: spec.title,
                description: spec.description,
              },
              task: {
                id: task.id,
                description: task.description,
                status: task.status,
                dependencies: task.dependencies,
                attempts: task.attempts,
              },
            };
          }
        }
      }

      return {
        success: true,
        message: 'No tasks available',
        task: null,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Read enriched context from bridge file with 60-second freshness check.
   * Returns null if file doesn't exist, is stale, or can't be read.
   */
  private async readEnrichedContext(): Promise<EnrichedContextBridge | null> {
    try {
      const bridgePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'enriched-context.json'
      );
      const content = await fs.readFile(bridgePath, 'utf-8');
      const bridge: EnrichedContextBridge = JSON.parse(content);

      // Freshness check: ignore data older than 60 seconds
      if (Date.now() - bridge.timestamp > 60000) {
        return null;
      }

      return bridge;
    } catch {
      // File doesn't exist or can't be parsed — graceful fallback
      return null;
    }
  }

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
   * MCP Tool: gofer_execute_task
   * Execute a specific task (returns task context for Claude to implement)
   */
  async executeTask(specId: string, taskId: string): Promise<ExecuteTaskResponse> {
    // Validate inputs
    const specValidation = this.validateSpecId(specId);
    if (!specValidation.valid) {
      return { success: false, error: specValidation.error, errorCode: 'INVALID_SPEC_ID' };
    }

    const taskValidation = this.validateTaskId(taskId);
    if (!taskValidation.valid) {
      return { success: false, error: taskValidation.error, errorCode: 'INVALID_TASK_ID' };
    }

    try {
      const spec = await this.goferLoader.loadSpec(specId);

      if (!spec) {
        return {
          success: false,
          error: `Spec ${specId} not found or could not be loaded`,
          errorCode: 'SPEC_NOT_FOUND',
        };
      }

      const task = spec.tasks.find((t) => t.id === taskId);

      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found in spec ${specId}`,
        };
      }

      // Check dependencies
      if (!this.areDependenciesMet(spec, task)) {
        return {
          success: false,
          error: `Task ${taskId} has unmet dependencies: ${task.dependencies.join(', ')}`,
        };
      }

      // Load constitution for context
      const constitutionPath = `${this.workspacePath}/.specify/memory/constitution.md`;
      let constitution = '';
      try {
        constitution = await fs.readFile(constitutionPath, 'utf-8');
      } catch {
        // Constitution is optional
      }

      // Generate Test Harness (Phase 3 Improvement) - non-fatal if it fails
      let testHarnessPath: string | undefined;
      try {
        testHarnessPath = await this.testHarnessGenerator.ensureTestHarness(
          specId,
          taskId,
          task.description
        );
      } catch {
        // Test harness generation is optional - don't fail the task
      }

      // Try to read enriched context from bridge file (Spec 013 Phase 3)
      const enriched = await this.readEnrichedContext();

      // Build response with enriched data if available
      const response: ExecuteTaskResponse = {
        success: true,
        spec,
        task,
        constitution:
          enriched?.sections.constitution ||
          (constitution ? constitution.substring(0, 2000) : undefined),
        testHarnessPath,
      };

      // Add enriched fields if bridge data is fresh (T025, T026)
      if (enriched) {
        response.memories = enriched.sections.memories;
        response.hints = enriched.sections.hints;
        response.researchChunks = enriched.sections.research;
        // Include graph context and code context if available
        if (enriched.sections.graphContext) {
          response.hints = (response.hints || '') + '\n\n' + enriched.sections.graphContext;
        }
        if (enriched.memoryCoverage) {
          response.memoryCoverage = {
            coveragePercent: enriched.memoryCoverage.coveragePercent,
            memoriesLoaded: enriched.memoryCoverage.memoriesLoaded,
            researchLoadedForGaps: enriched.memoryCoverage.researchLoadedForGaps,
          };
        }
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * MCP Tool: gofer_update_task_status
   * Update the status of a task
   */
  async updateTaskStatus(
    specId: string,
    taskId: string,
    status: string
  ): Promise<UpdateTaskStatusResponse> {
    // Validate inputs
    const specValidation = this.validateSpecId(specId);
    if (!specValidation.valid) {
      return { success: false, error: specValidation.error, errorCode: 'INVALID_SPEC_ID' };
    }

    const taskValidation = this.validateTaskId(taskId);
    if (!taskValidation.valid) {
      return { success: false, error: taskValidation.error, errorCode: 'INVALID_TASK_ID' };
    }

    // Validate status
    const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'failed'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        errorCode: 'INVALID_STATUS',
      };
    }

    try {
      await this.goferLoader.updateTaskStatus(specId, taskId, status);

      // Notify extension via LSP
      this.connection.sendNotification('gofer/taskProgress', {
        specId,
        taskId,
        status,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Task ${taskId} status updated to ${status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * MCP Tool: gofer_validate_code
   * Validate code against constitutional requirements without direct model API calls.
   */
  async validateCode(files: string[]): Promise<ValidateCodeResponse> {
    try {
      const allIssues: ValidationIssue[] = [];
      let allValid = true;

      for (const file of files) {
        // Handle both relative and absolute paths
        const fullPath = path.isAbsolute(file) ? file : path.join(this.workspacePath, file);

        const result = await this.validationService.validateFile(fullPath);

        if (!result.isValid) {
          allValid = false;
        }

        // Map service issues to tool response issues
        const mappedIssues: ValidationIssue[] = result.issues.map(
          (i: {
            severity?: string;
            category?: string;
            description?: string;
            location?: string;
          }) => {
            // Attempt to parse line number from location (e.g. "L10" or "10:5")
            let line: number | undefined;
            if (i.location) {
              const match = i.location.match(/(\d+)/);
              if (match) {
                line = parseInt(match[1]);
              }
            }

            return {
              file,
              severity: i.severity === 'critical' ? 'error' : 'warning',
              message: `[${i.category}] ${i.description}`,
              line,
            };
          }
        );

        allIssues.push(...mappedIssues);
      }

      return {
        success: true,
        isValid: allValid,
        files: files,
        message: allValid
          ? 'All files passed static validation.'
          : `Static validation found ${allIssues.filter((i) => i.severity === 'error').length} critical issue(s).`,
        issues: allIssues,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * MCP Tool: gofer_run_tests
   * Run tests for a specification
   */
  async runTests(specId: string): Promise<TestResult> {
    try {
      // Placeholder for test runner
      // Full implementation will detect framework and run tests

      return {
        success: true,
        message: 'Test runner not yet implemented',
        note: 'Test runner will be implemented in Phase 3',
        specId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Health Enhancement Tools (spec 011)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate observation ID format (UUID v4)
   */
  private validateObservationId(observationId: string): { valid: boolean; error?: string } {
    if (!observationId || typeof observationId !== 'string') {
      return { valid: false, error: 'observationId must be a non-empty string' };
    }

    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(observationId)) {
      this.logSecurityViolation('Invalid observation ID format', { observationId });
      return { valid: false, error: 'observationId must be a valid UUID v4' };
    }

    return { valid: true };
  }

  /**
   * MCP Tool: gofer_expand_observation
   * Retrieves the full content of a masked observation
   */
  async expandObservation(observationId: string): Promise<ExpandObservationResponse> {
    try {
      // Validate observation ID
      const validation = this.validateObservationId(observationId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          errorCode: 'INVALID_OBSERVATION_ID',
        };
      }

      // Look up observation in cache
      const cachePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'observation-cache',
        'index.json'
      );

      try {
        const cacheContent = await fs.readFile(cachePath, 'utf-8');
        const cache = JSON.parse(cacheContent) as {
          version: number;
          observations: Array<{
            id: string;
            type: 'file_read' | 'command_output' | 'api_response' | 'search_result' | 'test_output';
            timestamp: number;
            turnNumber: number;
            tokenEstimate: number;
            originalContent: string;
            metadata?: Record<string, unknown>;
          }>;
        };

        const observation = cache.observations.find((o) => o.id === observationId);
        if (!observation) {
          return {
            success: false,
            error: 'Observation not found',
            errorCode: 'OBSERVATION_NOT_FOUND',
          };
        }

        return {
          success: true,
          observation: {
            id: observation.id,
            type: observation.type,
            timestamp: observation.timestamp,
            turnNumber: observation.turnNumber,
            tokenEstimate: observation.tokenEstimate,
            content: observation.originalContent,
            metadata: observation.metadata,
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            success: false,
            error: 'Observation cache not found',
            errorCode: 'CACHE_ERROR',
          };
        }
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'CACHE_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_get_context_health
   * Returns the current context health status with breakdown
   *
   * Reads from extension-written state file first (Spec 012),
   * falls back to file-based calculation if state is stale or missing.
   */
  async getContextHealth(includeBreakdown: boolean = true): Promise<ContextHealthResponse> {
    try {
      // Try to read real state from extension (Spec 012)
      const stateFile = path.join(this.workspacePath, '.specify/memory/context-health-state.json');
      try {
        const stateContent = await fs.readFile(stateFile, 'utf-8');
        const state = JSON.parse(stateContent);

        // Check if state is fresh (within last 30 seconds)
        if (Date.now() - state.timestamp < 30000) {
          return {
            success: true,
            health: {
              status: state.status,
              utilizationPercent: Math.round(state.utilizationPercent * 10) / 10,
              tokensUsed: state.tokensUsed,
              tokensLimit: state.tokensLimit,
              breakdown: includeBreakdown ? state.breakdown : undefined,
              recommendations: state.recommendations || [],
              timestamp: state.timestamp,
              // Real context monitoring fields (Spec 014 T042)
              dataSource: state.dataSource,
              model: state.model,
              sessionId: state.sessionId,
            },
          };
        }
      } catch {
        // State file doesn't exist or is invalid, fall through to calculation
      }

      // Fallback: calculate from file sizes (similar to check-context-health.sh)
      return this.calculateContextHealthFromFiles(includeBreakdown);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate context health from file sizes.
   * Fallback when extension state is not available.
   */
  private async calculateContextHealthFromFiles(
    includeBreakdown: boolean
  ): Promise<ContextHealthResponse> {
    const effectiveLimit = 120000;

    // Calculate token estimates from files
    const breakdown = {
      specArtifacts: await this.estimateTokensFromGlob('.specify/specs/**/*.md'),
      memories: await this.estimateTokensFromGlob('.specify/memory/**/*.md'),
      hints: await this.estimateTokensFromFile('hints.md'),
      observations: 0, // Cannot calculate without runtime state
      systemFiles:
        (await this.estimateTokensFromFile('CLAUDE.md')) +
        (await this.estimateTokensFromFile('AGENTS.md')) +
        (await this.estimateTokensFromFile('.specify/memory/constitution.md')),
      conversation: 0, // Cannot calculate without runtime state
    };

    const tokensUsed = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const utilizationPercent = (tokensUsed / effectiveLimit) * 100;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (utilizationPercent >= 70) {
      status = 'critical';
    } else if (utilizationPercent >= 50) {
      status = 'warning';
    }

    const recommendations: string[] = [];
    if (status === 'warning') {
      recommendations.push('Consider masking older observations to free up context');
    }
    if (status === 'critical') {
      recommendations.push('Run /7_gofer_save immediately, then start new session');
    }

    return {
      success: true,
      health: {
        status,
        utilizationPercent: Math.round(utilizationPercent * 10) / 10,
        tokensUsed,
        tokensLimit: effectiveLimit,
        breakdown: includeBreakdown ? breakdown : undefined,
        recommendations,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Estimate tokens from a single file.
   * Uses 4 chars = 1 token approximation.
   */
  private async estimateTokensFromFile(relativePath: string): Promise<number> {
    try {
      const fullPath = path.join(this.workspacePath, relativePath);
      const stats = await fs.stat(fullPath);
      return Math.ceil(stats.size / 4);
    } catch {
      return 0;
    }
  }

  /**
   * Estimate tokens from files matching a glob pattern.
   * Uses 4 chars = 1 token approximation.
   */
  private async estimateTokensFromGlob(pattern: string): Promise<number> {
    try {
      const glob = await import('glob');
      const files = await glob.glob(pattern, {
        cwd: this.workspacePath,
        ignore: this.getContextHealthGlobIgnore(pattern),
      });
      let totalTokens = 0;

      for (const file of files) {
        totalTokens += await this.estimateTokensFromFile(file);
      }

      return totalTokens;
    } catch {
      return 0;
    }
  }

  private getContextHealthGlobIgnore(pattern: string): string[] {
    if (!pattern.startsWith('.specify/specs/')) {
      return [];
    }

    return ['.specify/specs/_*/**', '.specify/specs/**/_*/**'];
  }

  /**
   * MCP Tool: gofer_get_research_index
   * Returns the index of available research chunks for a spec
   */
  async getResearchIndex(specId: string): Promise<ResearchIndexResponse> {
    try {
      // Validate spec ID
      const validation = this.validateSpecId(specId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          errorCode: 'INVALID_SPEC_ID',
        };
      }

      // Check if spec exists
      const specDir = path.join(this.workspacePath, '.specify', 'specs', specId);
      const researchPath = path.join(specDir, 'research.md');

      try {
        await fs.access(specDir);
      } catch {
        return {
          success: false,
          error: 'Spec not found',
          errorCode: 'SPEC_NOT_FOUND',
        };
      }

      try {
        await fs.access(researchPath);
      } catch {
        return {
          success: false,
          error: 'research.md not found',
          errorCode: 'NO_RESEARCH_FILE',
        };
      }

      // Use ResearchChunker to get/generate the index
      const index = await this.researchChunker.getIndex(specId);

      return {
        success: true,
        index: {
          sourceFile: index.sourceFile,
          totalTokens: index.totalTokens,
          chunkCount: index.chunkCount,
          created: index.created,
          chunks: index.chunks,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'INDEX_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_load_research_chunk
   * Loads a specific chunk of a research document by ID
   */
  async loadResearchChunk(specId: string, chunkId: string): Promise<LoadResearchChunkResponse> {
    try {
      // Validate spec ID
      const specValidation = this.validateSpecId(specId);
      if (!specValidation.valid) {
        return {
          success: false,
          error: specValidation.error,
          errorCode: 'INVALID_SPEC_ID',
        };
      }

      // Use ResearchChunker to get the chunk
      const chunk = await this.researchChunker.getChunk(specId, chunkId);

      if (!chunk) {
        return {
          success: false,
          error: 'Chunk not found',
          errorCode: 'CHUNK_NOT_FOUND',
        };
      }

      return {
        success: true,
        chunk: {
          id: chunk.id,
          sectionTitle: chunk.sectionTitle,
          content: chunk.content,
          tokenEstimate: chunk.tokenEstimate,
          relevanceKeywords: chunk.relevanceKeywords,
          order: chunk.order,
        },
      };
    } catch (error) {
      // Handle specific errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Research file not found')) {
        return {
          success: false,
          error: 'research.md not found',
          errorCode: 'NO_RESEARCH_FILE',
        };
      }

      if (errorMessage.includes('Invalid spec ID')) {
        return {
          success: false,
          error: errorMessage,
          errorCode: 'INVALID_SPEC_ID',
        };
      }

      return {
        success: false,
        error: errorMessage,
        errorCode: 'CHUNK_NOT_FOUND',
      };
    }
  }

  /**
   * MCP Tool: gofer_trigger_handoff
   * Manually triggers a session handoff with context preservation
   */
  async triggerHandoff(
    reason: 'context_critical' | 'manual_request' | 'stage_complete' | 'error_recovery',
    currentTask?: string,
    notes?: string
  ): Promise<TriggerHandoffResponse> {
    try {
      // Get current spec context
      const specs = await this.goferLoader.loadAllSpecs();
      const activeSpec = specs.find((s) => s.status === 'in_progress' || s.status === 'ready');

      if (!activeSpec) {
        return {
          success: false,
          error: 'No active feature context to hand off',
          errorCode: 'NO_ACTIVE_FEATURE',
        };
      }

      // Create handoff document
      const handoffPath = path.join(
        this.workspacePath,
        '.specify',
        'specs',
        activeSpec.id,
        'session-handoff.md'
      );

      const completedTasks = activeSpec.tasks
        .filter((t) => t.status === 'completed')
        .map((t) => t.id);

      const handoffContent = `---
feature: ${activeSpec.id}
created: ${new Date().toISOString()}
reason: ${reason}
current_task: ${currentTask || 'none'}
---

# Session Handoff: ${activeSpec.title}

## Context Snapshot

- **Timestamp**: ${new Date().toISOString()}
- **Reason**: ${reason}
- **Current Task**: ${currentTask || 'None specified'}

## Progress

### Completed Tasks (${completedTasks.length}/${activeSpec.tasks.length})

${completedTasks.map((t) => `- [x] ${t}`).join('\n')}

### Remaining Tasks

${activeSpec.tasks
  .filter((t) => t.status !== 'completed')
  .map((t) => `- [ ] ${t.id}: ${t.description}`)
  .join('\n')}

## Notes

${notes || 'No additional notes.'}

## Continue From Checkpoint

1. Open this handoff file in a fresh session.
2. Read \`.specify/specs/${activeSpec.id}/session-checkpoint.md\` if present.
3. Continue from the recorded Gofer stage, usually \`/5_gofer_implement\` or
   \`/6_gofer_validate\`.
`;

      await fs.writeFile(handoffPath, handoffContent, 'utf-8');

      return {
        success: true,
        handoff: {
          file: handoffPath,
          created: Date.now(),
          contextSnapshot: {
            tokensUsed: 0, // Will be filled by ContextHealthMonitor
            utilizationPercent: 0,
            completedTasks,
            currentTask,
            stage: 'implement', // Simplified - would detect actual stage
          },
          resumeCommand: `Read ${handoffPath} and continue from the recorded Gofer stage.`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'HANDOFF_ERROR',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T060: Observation Folding & Peek MCP Tools
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * MCP Tool: gofer_peek_observation
   * Returns key-points or summary of an observation without full expansion.
   */
  async peekObservation(observationId: string): Promise<PeekObservationResponse> {
    try {
      const validation = this.validateObservationId(observationId);
      if (!validation.valid) {
        return { success: false, error: validation.error, errorCode: 'INVALID_OBSERVATION_ID' };
      }

      const cachePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'observation-cache',
        'index.json'
      );
      const cacheContent = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(cacheContent) as { observations: Array<ObservationCacheEntry> };

      const observation = cache.observations.find((o) => o.id === observationId);
      if (!observation) {
        return {
          success: false,
          error: 'Observation not found',
          errorCode: 'OBSERVATION_NOT_FOUND',
        };
      }

      // Return key-points if available, otherwise first/last lines
      const peek =
        observation.keyPointsContent ||
        this.generateQuickPeek(observation.originalContent, observation.type);

      return {
        success: true,
        peek: {
          id: observation.id,
          type: observation.type,
          decayTier: observation.decayTier || 'full',
          foldLevel: observation.foldLevel,
          tokenEstimate: observation.tokenEstimate,
          peekContent: peek,
          metadata: observation.metadata,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'CACHE_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_fold_observation
   * Sets the fold level for an observation in the cache.
   */
  async foldObservation(
    observationId: string,
    foldLevel: 'collapsed' | 'summary' | 'expanded'
  ): Promise<FoldObservationResponse> {
    try {
      const validation = this.validateObservationId(observationId);
      if (!validation.valid) {
        return { success: false, error: validation.error, errorCode: 'INVALID_OBSERVATION_ID' };
      }

      if (!['collapsed', 'summary', 'expanded'].includes(foldLevel)) {
        return {
          success: false,
          error: 'foldLevel must be collapsed, summary, or expanded',
          errorCode: 'INVALID_FOLD_LEVEL',
        };
      }

      const cachePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'observation-cache',
        'index.json'
      );
      const cacheContent = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(cacheContent) as {
        version: number;
        observations: Array<ObservationCacheEntry>;
        lastSaved: number;
      };

      const observation = cache.observations.find((o) => o.id === observationId);
      if (!observation) {
        return {
          success: false,
          error: 'Observation not found',
          errorCode: 'OBSERVATION_NOT_FOUND',
        };
      }

      const previousLevel = observation.foldLevel;
      observation.foldLevel = foldLevel;

      // Write back to disk
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');

      // Track in operation history
      this.recordContextOperation({
        type: 'fold',
        observationId,
        foldLevel,
        previousLevel,
        timestamp: Date.now(),
      });

      return {
        success: true,
        result: {
          id: observationId,
          previousLevel: previousLevel || 'expanded',
          newLevel: foldLevel,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'CACHE_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_grep_observations
   * Searches across all observation content for a pattern.
   */
  async grepObservations(
    pattern: string,
    maxResults: number = 10
  ): Promise<GrepObservationsResponse> {
    try {
      if (!pattern || typeof pattern !== 'string' || pattern.length > 500) {
        return {
          success: false,
          error: 'pattern must be a non-empty string (max 500 chars)',
          errorCode: 'INVALID_PATTERN',
        };
      }

      const cachePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'observation-cache',
        'index.json'
      );
      const cacheContent = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(cacheContent) as { observations: Array<ObservationCacheEntry> };

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }

      const matches: Array<{
        id: string;
        type: string;
        matchCount: number;
        excerpts: string[];
        metadata?: Record<string, unknown>;
      }> = [];

      for (const observation of cache.observations) {
        const content = observation.originalContent || '';
        const allMatches = content.match(regex);
        if (allMatches && allMatches.length > 0) {
          // Extract context around first few matches
          const excerpts: string[] = [];
          const lines = content.split('\n');
          let found = 0;
          for (let i = 0; i < lines.length && found < 3; i++) {
            if (regex.test(lines[i])) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length, i + 2);
              excerpts.push(lines.slice(start, end).join('\n'));
              found++;
            }
            regex.lastIndex = 0; // Reset regex state
          }

          matches.push({
            id: observation.id,
            type: observation.type,
            matchCount: allMatches.length,
            excerpts,
            metadata: observation.metadata,
          });

          if (matches.length >= maxResults) break;
        }
      }

      return {
        success: true,
        results: {
          pattern,
          totalMatches: matches.reduce((sum, m) => sum + m.matchCount, 0),
          observationsMatched: matches.length,
          matches,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'GREP_ERROR',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T067: Context REPL MCP Tools
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * MCP Tool: gofer_context_peek
   * Peeks at a specific section of the current context.
   */
  async contextPeek(section: string): Promise<ContextReplResponse> {
    try {
      const statePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'context-health-state.json'
      );
      try {
        const content = await fs.readFile(statePath, 'utf-8');
        const state = JSON.parse(content);
        const sectionContent = state.sections?.[section];
        if (sectionContent) {
          return {
            success: true,
            content:
              typeof sectionContent === 'string' ? sectionContent : JSON.stringify(sectionContent),
            section,
          };
        }
        return {
          success: true,
          content: `Section '${section}' not found. Available: ${Object.keys(state.sections || {}).join(', ')}`,
          section,
        };
      } catch {
        return { success: false, error: 'Context state not available', errorCode: 'NO_STATE' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'REPL_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_context_grep
   * Searches across all context sections for a pattern.
   */
  async contextGrep(pattern: string): Promise<ContextGrepResponse> {
    try {
      if (!pattern || pattern.length > 500) {
        return {
          success: false,
          error: 'pattern must be non-empty (max 500 chars)',
          errorCode: 'INVALID_PATTERN',
        };
      }

      const statePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'context-health-state.json'
      );
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }

      const sectionMatches: Array<{ section: string; matchCount: number; excerpts: string[] }> = [];

      for (const [sectionName, sectionContent] of Object.entries(state.sections || {})) {
        const text =
          typeof sectionContent === 'string' ? sectionContent : JSON.stringify(sectionContent);
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          const lines = text.split('\n');
          const excerpts: string[] = [];
          let found = 0;
          for (let i = 0; i < lines.length && found < 3; i++) {
            if (regex.test(lines[i])) {
              excerpts.push(`L${i + 1}: ${lines[i].slice(0, 200)}`);
              found++;
            }
            regex.lastIndex = 0;
          }
          sectionMatches.push({ section: sectionName, matchCount: matches.length, excerpts });
        }
      }

      return {
        success: true,
        results: {
          pattern,
          sectionMatches,
          totalMatches: sectionMatches.reduce((s, m) => s + m.matchCount, 0),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'GREP_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_context_fold
   * Folds (collapses) a context section.
   */
  async contextFold(section: string): Promise<ContextReplResponse> {
    return this.updateContextFoldState(section, 'collapsed');
  }

  /**
   * MCP Tool: gofer_context_expand
   * Expands a collapsed context section.
   */
  async contextExpand(section: string): Promise<ContextReplResponse> {
    return this.updateContextFoldState(section, 'expanded');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T074: Context Undo & History MCP Tools
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * MCP Tool: gofer_context_undo
   * Reverts last fold/expand operation.
   */
  async contextUndo(): Promise<ContextReplResponse> {
    try {
      const history = await this.loadOperationHistory();
      if (history.length === 0) {
        return { success: false, error: 'No operations to undo', errorCode: 'EMPTY_HISTORY' };
      }

      const lastOp = history.pop()!;
      await this.saveOperationHistory(history);

      // Revert the operation
      if (lastOp.type === 'fold' && lastOp.observationId) {
        const previousLevel = lastOp.previousLevel || 'expanded';
        const cachePath = path.join(
          this.workspacePath,
          '.specify',
          'memory',
          'observation-cache',
          'index.json'
        );
        try {
          const cacheContent = await fs.readFile(cachePath, 'utf-8');
          const cache = JSON.parse(cacheContent) as {
            version: number;
            observations: Array<ObservationCacheEntry>;
            lastSaved: number;
          };
          const obs = cache.observations.find((o) => o.id === lastOp.observationId);
          if (obs) {
            obs.foldLevel = previousLevel as 'collapsed' | 'summary' | 'expanded';
            await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
          }
        } catch {
          /* cache may not exist */
        }
        return {
          success: true,
          content: `Undid fold: ${lastOp.observationId} reverted to ${previousLevel}`,
          section: 'undo',
        };
      } else if (lastOp.type === 'context_fold' || lastOp.type === 'context_expand') {
        const revertLevel = lastOp.type === 'context_fold' ? 'expanded' : 'collapsed';
        await this.updateContextFoldState(lastOp.section || '', revertLevel);
        return {
          success: true,
          content: `Undid ${lastOp.type}: ${lastOp.section} reverted to ${revertLevel}`,
          section: 'undo',
        };
      }

      return { success: true, content: `Undid operation: ${lastOp.type}`, section: 'undo' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'UNDO_ERROR',
      };
    }
  }

  /**
   * MCP Tool: gofer_context_history
   * Shows last 10 context operations with timestamps.
   */
  async contextHistory(): Promise<ContextHistoryResponse> {
    try {
      const history = await this.loadOperationHistory();
      return {
        success: true,
        operations: history.slice(-10).map((op) => ({
          type: op.type,
          target: op.observationId || op.section || '',
          detail: op.foldLevel || '',
          timestamp: op.timestamp,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 018 T066: SlopDetector MCP tool
  // ─────────────────────────────────────────────────────────────────────────────

  async checkSlop(scanPath?: string): Promise<{
    success: boolean;
    report?: {
      totalIssues: number;
      filesScanned: number;
      matches: Array<{
        file: string;
        line: number;
        pattern: string;
        severity: string;
        message: string;
      }>;
    };
    error?: string;
  }> {
    try {
      const targetPath = scanPath || path.join(this.workspacePath, 'extension', 'src');
      const fsSync = await import('fs');

      // Inline slop scanning to avoid cross-package import
      const SLOP_PATTERNS = [
        {
          regex: /\bit\.skip\b|\btest\.skip\b|\bdescribe\.skip\b/,
          name: 'disabled-test',
          severity: 'error',
          message: 'Disabled test found',
        },
        {
          regex: /\bTODO\b(?!.*(?:#\d+|[A-Z]+-\d+))/,
          name: 'todo-no-issue',
          severity: 'warning',
          message: 'TODO without issue reference',
        },
        {
          regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
          name: 'empty-catch',
          severity: 'warning',
          message: 'Empty catch block',
        },
        { regex: /\bas\s+any\b/, name: 'as-any', severity: 'warning', message: 'as any cast' },
        {
          regex: /\bdebugger\b/,
          name: 'debugger',
          severity: 'error',
          message: 'debugger statement',
        },
      ];
      const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

      const matches: Array<{
        file: string;
        line: number;
        pattern: string;
        severity: string;
        message: string;
      }> = [];
      let filesScanned = 0;

      const scanFile = (filePath: string): void => {
        const content = fsSync.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const p of SLOP_PATTERNS) {
            if (p.regex.test(lines[i])) {
              matches.push({
                file: filePath,
                line: i + 1,
                pattern: p.name,
                severity: p.severity,
                message: p.message,
              });
            }
          }
        }
      };

      try {
        scanFile(targetPath);
        filesScanned = 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { success: false, error: `Path not found: ${targetPath}` };
        }

        if ((error as NodeJS.ErrnoException).code !== 'EISDIR') {
          throw error;
        }

        const walk = (dir: string): void => {
          if (filesScanned >= 200) return;
          try {
            const entries = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (filesScanned >= 200) return;
              const fp = path.join(dir, entry.name);
              if (
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                entry.name !== 'node_modules' &&
                entry.name !== 'dist'
              ) {
                walk(fp);
              } else if (entry.isFile() && SCAN_EXT.has(path.extname(entry.name))) {
                filesScanned++;
                scanFile(fp);
              }
            }
          } catch {
            /* skip unreadable dirs */
          }
        };
        walk(targetPath);
      }

      return {
        success: true,
        report: { totalIssues: matches.length, filesScanned, matches: matches.slice(0, 50) },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 019 T050-T053: Compound Context REPL
  // ─────────────────────────────────────────────────────────────────────────────

  async contextRepl(operations: Array<Record<string, unknown>>): Promise<{
    success: boolean;
    results: Array<{ op: string; target: string; success: boolean; message: string }>;
    error?: string;
  }> {
    try {
      if (!Array.isArray(operations) || operations.length === 0) {
        return {
          success: false,
          results: [],
          error: 'Operations array is required and must be non-empty',
        };
      }

      if (operations.length > 50) {
        return { success: false, results: [], error: 'Maximum 50 operations per batch' };
      }

      const results: Array<{ op: string; target: string; success: boolean; message: string }> = [];

      for (const operation of operations) {
        const op = (operation.op as string) || '';
        const target = (operation.target as string) || '';
        const age = (operation.age as number) || 0;

        try {
          switch (op) {
            case 'fold': {
              const foldResult = await this.updateContextFoldState(target, 'collapsed');
              results.push({
                op,
                target,
                success: foldResult.success,
                message: foldResult.content || foldResult.error || '',
              });
              break;
            }
            case 'expand': {
              const expandResult = await this.updateContextFoldState(target, 'expanded');
              results.push({
                op,
                target,
                success: expandResult.success,
                message: expandResult.content || expandResult.error || '',
              });
              break;
            }
            case 'peek': {
              const peekResult = await this.contextPeek(target);
              results.push({
                op,
                target,
                success: peekResult.success,
                message: peekResult.content?.slice(0, 200) || peekResult.error || '',
              });
              break;
            }
            case 'fold-all-older-than': {
              // Fold all sections with observations older than N turns
              const foldStatePath = path.join(
                this.workspacePath,
                '.specify',
                'memory',
                'context-fold-state.json'
              );
              let foldState: Record<string, string> = {};
              try {
                const content = await fs.readFile(foldStatePath, 'utf-8');
                foldState = JSON.parse(content);
              } catch {
                /* start fresh */
              }

              let foldCount = 0;
              for (const [section] of Object.entries(foldState)) {
                if (foldState[section] !== 'collapsed') {
                  foldState[section] = 'collapsed';
                  foldCount++;
                }
              }
              // Also fold any observation-like sections based on age param
              if (age > 0) {
                foldState[`_bulk_fold_age_${age}`] = 'collapsed';
              }
              await fs.writeFile(foldStatePath, JSON.stringify(foldState, null, 2), 'utf-8');
              results.push({
                op,
                target: `age>${age}`,
                success: true,
                message: `Folded ${foldCount} sections older than ${age} turns`,
              });
              break;
            }
            default:
              results.push({ op, target, success: false, message: `Unknown operation: ${op}` });
          }
        } catch (opError) {
          results.push({
            op,
            target,
            success: false,
            message: opError instanceof Error ? opError.message : 'Operation failed',
          });
        }
      }

      return { success: true, results };
    } catch (error) {
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 019 T059-T061: Test Runner MCP Tool
  // ─────────────────────────────────────────────────────────────────────────────

  async runTestsDetect(
    testPath?: string,
    filter?: string
  ): Promise<{
    success: boolean;
    framework?: string;
    command?: string;
    passed?: number;
    failed?: number;
    total?: number;
    output?: string;
    error?: string;
  }> {
    try {
      const fsSync = await import('fs');
      const { execFile: execFileCb } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFileCb);

      // Detect test framework
      let framework = 'unknown';
      const pkgPath = path.join(this.workspacePath, 'package.json');
      if (fsSync.existsSync(pkgPath)) {
        const pkg = JSON.parse(fsSync.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps['vitest']) framework = 'vitest';
        else if (allDeps['jest']) framework = 'jest';
        else if (allDeps['mocha']) framework = 'mocha';
      }
      // Check for pytest
      if (framework === 'unknown') {
        if (
          fsSync.existsSync(path.join(this.workspacePath, 'pytest.ini')) ||
          fsSync.existsSync(path.join(this.workspacePath, 'pyproject.toml'))
        ) {
          framework = 'pytest';
        }
      }

      // Build command
      let cmd: string;
      let args: string[];
      const targetPath = testPath || '.';

      switch (framework) {
        case 'vitest':
          cmd = 'npx';
          args = ['vitest', 'run', targetPath];
          if (filter) args.push('-t', filter);
          break;
        case 'jest':
          cmd = 'npx';
          args = ['jest', targetPath];
          if (filter) args.push('-t', filter);
          break;
        case 'pytest':
          cmd = 'python';
          args = ['-m', 'pytest', targetPath];
          if (filter) args.push('-k', filter);
          break;
        default:
          cmd = 'npm';
          args = ['test'];
          break;
      }

      const command = `${cmd} ${args.join(' ')}`;

      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: this.workspacePath,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        });
        const output = (stdout + '\n' + stderr).trim();

        // Parse results
        const { passed, failed, total } = this.parseTestOutput(output, framework);

        return {
          success: true,
          framework,
          command,
          passed,
          failed,
          total,
          output: output.slice(-2000),
        };
      } catch (execError) {
        // Test failures often exit non-zero
        const err = execError as { stdout?: string; stderr?: string };
        const output = ((err.stdout || '') + '\n' + (err.stderr || '')).trim();
        const { passed, failed, total } = this.parseTestOutput(output, framework);
        return {
          success: true,
          framework,
          command,
          passed,
          failed,
          total,
          output: output.slice(-2000),
        };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private parseTestOutput(
    output: string,
    framework: string
  ): { passed: number; failed: number; total: number } {
    let passed = 0,
      failed = 0,
      total = 0;

    if (framework === 'vitest' || framework === 'jest') {
      // vitest/jest: "Tests  3 passed (3)"  or "Test Suites: 1 passed, 1 total"
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      if (passMatch) passed = parseInt(passMatch[1]);
      if (failMatch) failed = parseInt(failMatch[1]);
      total = passed + failed;
    } else if (framework === 'pytest') {
      // pytest: "3 passed, 1 failed"
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      if (passMatch) passed = parseInt(passMatch[1]);
      if (failMatch) failed = parseInt(failMatch[1]);
      total = passed + failed;
    }

    return { passed, failed, total };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers for context operations
  // ─────────────────────────────────────────────────────────────────────────────

  private async updateContextFoldState(
    section: string,
    level: 'collapsed' | 'expanded'
  ): Promise<ContextReplResponse> {
    try {
      const foldStatePath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'context-fold-state.json'
      );
      let foldState: Record<string, string> = {};
      try {
        const content = await fs.readFile(foldStatePath, 'utf-8');
        foldState = JSON.parse(content);
      } catch {
        /* start fresh */
      }

      const previous = foldState[section] || 'expanded';
      foldState[section] = level;
      await fs.writeFile(foldStatePath, JSON.stringify(foldState, null, 2), 'utf-8');

      this.recordContextOperation({
        type: level === 'collapsed' ? 'context_fold' : 'context_expand',
        section,
        timestamp: Date.now(),
        previousLevel: previous,
      });

      return {
        success: true,
        content: `Section '${section}' ${level === 'collapsed' ? 'folded' : 'expanded'}`,
        section,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'FOLD_ERROR',
      };
    }
  }

  private generateQuickPeek(content: string, type: string): string {
    const lines = content.split('\n');
    if (lines.length <= 5) return content;
    if (type === 'file_read') {
      return [
        ...lines.slice(0, 3),
        `  ... (${lines.length - 5} lines) ...`,
        ...lines.slice(-2),
      ].join('\n');
    }
    return [
      ...lines.slice(0, 5),
      `  ... (${lines.length - 10} lines) ...`,
      ...lines.slice(-5),
    ].join('\n');
  }

  private contextOperationHistory: ContextOperation[] = [];

  private recordContextOperation(op: ContextOperation): void {
    this.contextOperationHistory.push(op);
    if (this.contextOperationHistory.length > 50) {
      this.contextOperationHistory.shift();
    }
    // Fire-and-forget persist
    this.saveOperationHistory(this.contextOperationHistory).catch(() => {});
  }

  private async loadOperationHistory(): Promise<ContextOperation[]> {
    try {
      const histPath = path.join(
        this.workspacePath,
        '.specify',
        'memory',
        'context-operation-history.json'
      );
      const content = await fs.readFile(histPath, 'utf-8');
      this.contextOperationHistory = JSON.parse(content);
      return this.contextOperationHistory;
    } catch {
      return this.contextOperationHistory;
    }
  }

  private async saveOperationHistory(history: ContextOperation[]): Promise<void> {
    const histPath = path.join(
      this.workspacePath,
      '.specify',
      'memory',
      'context-operation-history.json'
    );
    const dir = path.dirname(histPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(histPath, JSON.stringify(history, null, 2), 'utf-8');
  }
}
