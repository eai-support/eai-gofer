/**
 * Gofer Language Server
 *
 * Provides both:
 * 1. Language Server Protocol (LSP) for extension communication
 * 2. Model Context Protocol (MCP) tools for Claude Code integration
 *
 * Architecture: Single server process that handles both protocols
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  Connection,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { GoferLoader } from './utils/goferLoader';
import { MCPToolHandler } from './mcp/toolHandler';

// Error types for better error handling
export class ServerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

export class ValidationError extends ServerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ServerError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// Logger utility with levels
class Logger {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  debug(message: string, data?: unknown): void {
    this.connection.console.log(`[DEBUG] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
  }

  info(message: string, data?: unknown): void {
    this.connection.console.info(`[INFO] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
  }

  warn(message: string, data?: unknown): void {
    this.connection.console.warn(`[WARN] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    const errorDetails =
      error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : error;

    this.connection.console.error(
      `[ERROR] ${message}${errorDetails ? ` Error: ${JSON.stringify(errorDetails)}` : ''}${
        data ? ` Data: ${JSON.stringify(data)}` : ''
      }`
    );
  }

  logServerEvent(event: string, data?: unknown): void {
    this.info(`Server Event: ${event}`, data);
  }

  logPerformance(operation: string, duration: number): void {
    this.debug(`Performance: ${operation} took ${duration}ms`);
  }
}

// Create LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create logger instance
const logger = new Logger(connection);

// Create text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Global state
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let workspacePath: string | undefined;

// Initialize Gofer loader and MCP tool handler
let goferLoader: GoferLoader | undefined;
let mcpToolHandler: MCPToolHandler | undefined;

// Async error wrapper
async function withErrorHandling<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();

  try {
    logger.debug(`Starting operation: ${operation}`);
    const result = await fn();
    const duration = Date.now() - startTime;
    logger.logPerformance(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Operation failed: ${operation} (${duration}ms)`, error);
    throw error;
  }
}

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  return withErrorHandling('server-initialization', async () => {
    logger.logServerEvent('Initializing Gofer Language Server', {
      processId: params.processId,
      workspaceFolders: params.workspaceFolders?.map((folder) => folder.uri),
    });

    const capabilities = params.capabilities;

    // Check client capabilities
    hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    // Get workspace path
    if (params.workspaceFolders && params.workspaceFolders.length > 0) {
      const resolvedWorkspacePath = params.workspaceFolders[0].uri.replace('file://', '');
      workspacePath = resolvedWorkspacePath;
      logger.info(`Workspace path: ${workspacePath}`);

      try {
        // Initialize Gofer loader
        goferLoader = new GoferLoader(resolvedWorkspacePath);
        mcpToolHandler = new MCPToolHandler(resolvedWorkspacePath, connection);
        logger.info('Gofer loader and MCP tool handler initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Gofer components', error);
        throw new ServerError('Failed to initialize server components', 'INIT_ERROR');
      }
    } else {
      logger.warn('No workspace folders provided during initialization');
    }

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // LSP capabilities
        completionProvider: {
          resolveProvider: true,
        },
        // MCP capabilities (experimental)
        experimental: {
          mcp: {
            // MCP tools exposed to Claude Code / GitHub Copilot
            tools: [
              {
                name: 'gofer_get_specs',
                description: 'Get all specifications from the .specify folder',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'gofer_get_next_task',
                description: 'Get the next available task to work on',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'gofer_execute_task',
                description: 'Execute a specific task from a specification',
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'The specification ID (e.g., "001-login-feature")',
                    },
                    taskId: {
                      type: 'string',
                      description: 'The task ID (e.g., "T001")',
                    },
                  },
                  required: ['specId', 'taskId'],
                },
              },
              {
                name: 'gofer_update_task_status',
                description: 'Update the status of a task',
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'The specification ID',
                    },
                    taskId: {
                      type: 'string',
                      description: 'The task ID',
                    },
                    status: {
                      type: 'string',
                      enum: ['pending', 'in_progress', 'testing', 'completed', 'failed', 'blocked'],
                      description: 'The new status',
                    },
                  },
                  required: ['specId', 'taskId', 'status'],
                },
              },
              {
                name: 'gofer_validate_code',
                description: 'Validate code against constitutional requirements',
                parameters: {
                  type: 'object',
                  properties: {
                    files: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Array of file paths to validate',
                    },
                  },
                  required: ['files'],
                },
              },
              {
                name: 'gofer_run_tests',
                description:
                  'Detect test framework (vitest/jest/pytest) and run tests with structured result parsing',
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'Backward-compatible specification ID or test target',
                    },
                    path: {
                      type: 'string',
                      description: 'Test file or directory path (defaults to project root)',
                    },
                    filter: {
                      type: 'string',
                      description: 'Test name filter pattern',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'gofer_expand_observation',
                description: 'Retrieve the full content of a masked observation by its ID',
                parameters: {
                  type: 'object',
                  properties: {
                    observationId: {
                      type: 'string',
                      description: 'UUID v4 observation ID',
                    },
                  },
                  required: ['observationId'],
                },
              },
              {
                name: 'gofer_get_context_health',
                description: 'Get current context health status including token usage breakdown',
                parameters: {
                  type: 'object',
                  properties: {
                    includeBreakdown: {
                      type: 'boolean',
                      description: 'Include detailed token breakdown',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'gofer_get_research_index',
                description: "Get the research chunk index for a spec's research.md file",
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'Spec identifier',
                    },
                  },
                  required: ['specId'],
                },
              },
              {
                name: 'gofer_load_research_chunk',
                description: "Load a specific research chunk by ID from a spec's research index",
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'Spec identifier',
                    },
                    chunkId: {
                      type: 'string',
                      description: 'Chunk identifier from research index',
                    },
                  },
                  required: ['specId', 'chunkId'],
                },
              },
              {
                name: 'gofer_trigger_handoff',
                description:
                  'Trigger a session handoff, saving current context state for resumption',
                parameters: {
                  type: 'object',
                  properties: {
                    specId: {
                      type: 'string',
                      description: 'Active spec identifier',
                    },
                    reason: {
                      type: 'string',
                      description: 'Reason for handoff',
                    },
                  },
                  required: ['specId'],
                },
              },
              // ── Observation Folding & Peek Tools ──
              {
                name: 'gofer_peek_observation',
                description:
                  'Returns key-points or summary of an observation without full expansion',
                parameters: {
                  type: 'object',
                  properties: {
                    observationId: {
                      type: 'string',
                      description: 'UUID v4 observation ID to peek at',
                    },
                  },
                  required: ['observationId'],
                },
              },
              {
                name: 'gofer_fold_observation',
                description: 'Sets the fold level (collapsed/summary/expanded) for an observation',
                parameters: {
                  type: 'object',
                  properties: {
                    observationId: {
                      type: 'string',
                      description: 'UUID v4 observation ID',
                    },
                    foldLevel: {
                      type: 'string',
                      enum: ['collapsed', 'summary', 'expanded'],
                      description: 'The fold level to set',
                    },
                  },
                  required: ['observationId', 'foldLevel'],
                },
              },
              {
                name: 'gofer_grep_observations',
                description: 'Searches across all observation content for a regex pattern',
                parameters: {
                  type: 'object',
                  properties: {
                    pattern: {
                      type: 'string',
                      description: 'Regex pattern to search for (max 500 chars)',
                    },
                    maxResults: {
                      type: 'number',
                      description:
                        'Maximum number of matching observations to return (default: 10)',
                    },
                  },
                  required: ['pattern'],
                },
              },
              // ── Context REPL Tools ──
              {
                name: 'gofer_context_peek',
                description: 'Peeks at a specific section of the current context state',
                parameters: {
                  type: 'object',
                  properties: {
                    section: {
                      type: 'string',
                      description: 'Context section name to peek at',
                    },
                  },
                  required: ['section'],
                },
              },
              {
                name: 'gofer_context_grep',
                description: 'Searches across all context sections for a pattern',
                parameters: {
                  type: 'object',
                  properties: {
                    pattern: {
                      type: 'string',
                      description: 'Regex pattern to search for (max 500 chars)',
                    },
                  },
                  required: ['pattern'],
                },
              },
              {
                name: 'gofer_context_fold',
                description: 'Folds (collapses) a context section to reduce token usage',
                parameters: {
                  type: 'object',
                  properties: {
                    section: {
                      type: 'string',
                      description: 'Context section name to fold',
                    },
                  },
                  required: ['section'],
                },
              },
              {
                name: 'gofer_context_expand',
                description: 'Expands a previously collapsed context section',
                parameters: {
                  type: 'object',
                  properties: {
                    section: {
                      type: 'string',
                      description: 'Context section name to expand',
                    },
                  },
                  required: ['section'],
                },
              },
              {
                name: 'gofer_context_undo',
                description:
                  'Reverts the last fold/expand operation on observations or context sections',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'gofer_context_history',
                description: 'Shows the last 10 context operations with timestamps',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'gofer_check_slop',
                description:
                  'Scans source files for common AI code quality issues (disabled tests, empty catch blocks, as any casts, leftover console.log)',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'File or directory path to scan (defaults to workspace root)',
                    },
                  },
                  required: [],
                },
              },
              // ── 019: Compound REPL and Test Runner ──
              {
                name: 'gofer_context_repl',
                description:
                  'Compound context REPL: batch multiple fold/expand/peek operations in a single call to reduce round-trips',
                parameters: {
                  type: 'object',
                  properties: {
                    operations: {
                      type: 'array',
                      description:
                        'Array of operations to execute sequentially. Each is {op: "fold"|"expand"|"peek"|"fold-all-older-than", target: "section-name", age?: number}',
                      items: {
                        type: 'object',
                      },
                    },
                  },
                  required: ['operations'],
                },
              },
              // ── Native app / repo-script bridge tools ──
              {
                name: 'gofer_check_workspace',
                description:
                  'Run the repo-owned Gofer workspace checker and report missing or stale scaffold files',
                parameters: {
                  type: 'object',
                  properties: {
                    host: {
                      type: 'string',
                      description:
                        'Host surface to check: auto, codex, claude, copilot, gemini, vscode',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'gofer_bootstrap_workspace',
                description:
                  'Run the repo-owned Gofer workspace bootstrap script to create or refresh scaffold files',
                parameters: {
                  type: 'object',
                  properties: {
                    host: {
                      type: 'string',
                      description:
                        'Host surface to bootstrap: auto, codex, claude, copilot, gemini, vscode',
                    },
                    includeMirrors: {
                      type: 'boolean',
                      description: 'Copy host-specific command, skill, agent, and prompt mirrors',
                    },
                    dryRun: {
                      type: 'boolean',
                      description: 'Preview changes without writing files',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'gofer_get_pipeline_state',
                description:
                  'Read current Gofer pipeline state, active feature, and available artifacts from .specify',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
              {
                name: 'gofer_start_stage',
                description:
                  'Resolve a Gofer stage command and return the safest next user-facing invocation for the active app',
                parameters: {
                  type: 'object',
                  properties: {
                    command: {
                      type: 'string',
                      description:
                        'Stage/helper command name such as 0_gofer_start or /6_gofer_validate',
                    },
                    feature: {
                      type: 'string',
                      description: 'Optional feature directory/name to pass through as context',
                    },
                  },
                  required: ['command'],
                },
              },
              {
                name: 'gofer_validate_branch',
                description:
                  'Summarize local branch state and recommend the Gofer validation commands/tests to run before review',
                parameters: {
                  type: 'object',
                  properties: {
                    base: {
                      type: 'string',
                      description:
                        'Optional base branch to compare against, defaults to origin/main',
                    },
                  },
                  required: [],
                },
              },
              {
                name: 'gofer_explain_eai_error',
                description:
                  'Explain an EAI CLI/platform error using eai errors explain when available, with repo catalog fallback',
                parameters: {
                  type: 'object',
                  properties: {
                    codeOrReason: {
                      type: 'string',
                      description: 'EAI error code, message, or reason to explain',
                    },
                  },
                  required: ['codeOrReason'],
                },
              },
              {
                name: 'gofer_open_artifact',
                description:
                  'Read a Gofer artifact inside the workspace with path traversal protection and size limiting',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description:
                        'Workspace-relative artifact path, for example .specify/specs/feature/spec.md',
                    },
                    maxBytes: {
                      type: 'number',
                      description: 'Maximum bytes to return; defaults to 20000',
                    },
                  },
                  required: ['path'],
                },
              },
            ],
          },
        },
      },
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      };
    }

    logger.info('Server initialization completed successfully');
    return result;
  });
});

connection.onInitialized(() => {
  try {
    logger.logServerEvent('Server initialized notification received');

    if (hasConfigurationCapability) {
      // Register for configuration changes
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders(() => {
        logger.info('Workspace folder change event received');
      });
    }

    logger.info('Gofer Language Server initialized successfully');
  } catch (error) {
    logger.error('Error during server initialization', error);
  }
});

// ============================================================================
// LSP CUSTOM METHODS
// ============================================================================

/**
 * LSP Custom Method: gofer/getSpecs
 * Returns all specifications from .specify/specs/
 */
connection.onRequest(
  'gofer/getSpecs',
  async (): Promise<{
    success: boolean;
    specs?: unknown[];
    error?: string;
  }> => {
    return withErrorHandling('lsp-get-specs', async () => {
      if (!goferLoader) {
        throw new ServerError('Gofer loader not initialized', 'NOT_INITIALIZED');
      }

      const specs = await goferLoader.loadAllSpecs();
      logger.debug(`Retrieved ${specs.length} specifications`);

      return {
        success: true,
        specs: specs,
      };
    }).catch((error) => {
      logger.error('Failed to get specs via LSP', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    });
  }
);

/**
 * LSP Custom Method: gofer/executeTask
 * Returns full context for a specific task
 */
connection.onRequest(
  'gofer/executeTask',
  async (params: {
    specId: string;
    taskId: string;
    context?: unknown;
  }): Promise<{
    success: boolean;
    task?: unknown;
    spec?: unknown;
    error?: string;
  }> => {
    return withErrorHandling('lsp-execute-task', async () => {
      if (!goferLoader) {
        throw new ServerError('Gofer loader not initialized', 'NOT_INITIALIZED');
      }

      if (!params.specId || !params.taskId) {
        throw new ValidationError('specId and taskId are required');
      }

      const spec = await goferLoader.loadSpec(params.specId);
      if (!spec) {
        throw new NotFoundError(`Specification: ${params.specId}`);
      }

      const task = spec.tasks.find((t: { id: string }) => t.id === params.taskId);
      if (!task) {
        throw new NotFoundError(`Task: ${params.taskId} in spec ${params.specId}`);
      }

      logger.debug(`Executing task ${params.taskId} from spec ${params.specId}`);

      return {
        success: true,
        task: task,
        spec: spec,
      };
    }).catch((error) => {
      logger.error('Failed to execute task via LSP', error, { params });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    });
  }
);

/**
 * LSP Custom Method: gofer/updateTaskStatus
 * Updates task status in specification file
 */
connection.onRequest(
  'gofer/updateTaskStatus',
  async (params: {
    specId: string;
    taskId: string;
    status: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }> => {
    return withErrorHandling('lsp-update-task-status', async () => {
      if (!goferLoader) {
        throw new ServerError('Gofer loader not initialized', 'NOT_INITIALIZED');
      }

      if (!params.specId || !params.taskId || !params.status) {
        throw new ValidationError('specId, taskId, and status are required');
      }

      const validStatuses = ['pending', 'in_progress', 'testing', 'completed', 'failed', 'blocked'];
      if (!validStatuses.includes(params.status)) {
        throw new ValidationError(
          `Invalid status: ${params.status}. Valid statuses: ${validStatuses.join(', ')}`
        );
      }

      await goferLoader.updateTaskStatus(params.specId, params.taskId, params.status);
      logger.info(
        `Updated task ${params.taskId} in spec ${params.specId} to status: ${params.status}`
      );

      // Notify extension of progress
      connection.sendNotification('gofer/taskProgress', {
        specId: params.specId,
        taskId: params.taskId,
        status: params.status,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
      };
    }).catch((error) => {
      logger.error('Failed to update task status via LSP', error, { params });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    });
  }
);

/**
 * LSP Custom Method: gofer/executeTask
 * Execute a task (called by extension, not MCP)
 */
// Note: Duplicate handler was removed - using improved version above with proper validation

// ============================================================================
// MCP TOOL HANDLERS
// ============================================================================

/**
 * MCP Tool Invocation Handler
 * Called by Claude Code or GitHub Copilot via VSCode's native MCP support
 */
connection.onRequest(
  'tools/call',
  async (params: { name: string; arguments: Record<string, unknown> }) => {
    return withErrorHandling('mcp-tools-call', async () => {
      if (!mcpToolHandler) {
        throw new ServerError('MCP tool handler not initialized', 'NOT_INITIALIZED');
      }

      const { name, arguments: args } = params;
      logger.debug(`MCP tool called: ${name}`, args);

      let result;
      switch (name) {
        case 'gofer_get_specs':
          result = await mcpToolHandler.getSpecs();
          break;

        case 'gofer_get_next_task':
          result = await mcpToolHandler.getNextTask();
          break;

        case 'gofer_execute_task':
          result = await mcpToolHandler.executeTask(args.specId as string, args.taskId as string);
          break;

        case 'gofer_update_task_status':
          result = await mcpToolHandler.updateTaskStatus(
            args.specId as string,
            args.taskId as string,
            args.status as string
          );
          break;

        case 'gofer_validate_code':
          result = await mcpToolHandler.validateCode(args.files as string[]);
          break;

        case 'gofer_run_tests':
          result = await mcpToolHandler.runTestsDetect(
            (args.path as string | undefined) ?? (args.specId as string | undefined),
            args.filter as string | undefined
          );
          break;

        case 'gofer_expand_observation':
          result = await mcpToolHandler.expandObservation(args.observationId as string);
          break;

        case 'gofer_get_context_health':
          result = await mcpToolHandler.getContextHealth(
            (args.includeBreakdown as boolean) ?? true
          );
          break;

        case 'gofer_get_research_index':
          result = await mcpToolHandler.getResearchIndex(args.specId as string);
          break;

        case 'gofer_load_research_chunk':
          result = await mcpToolHandler.loadResearchChunk(
            args.specId as string,
            args.chunkId as string
          );
          break;

        case 'gofer_trigger_handoff':
          result = await mcpToolHandler.triggerHandoff(
            (args.reason as string as
              | 'context_critical'
              | 'manual_request'
              | 'stage_complete'
              | 'error_recovery') || 'manual_request',
            undefined,
            args.specId ? `Spec: ${args.specId as string}` : undefined
          );
          break;

        // ── Observation Folding & Peek Tools ──
        case 'gofer_peek_observation':
          result = await mcpToolHandler.peekObservation(args.observationId as string);
          break;

        case 'gofer_fold_observation':
          result = await mcpToolHandler.foldObservation(
            args.observationId as string,
            args.foldLevel as 'collapsed' | 'summary' | 'expanded'
          );
          break;

        case 'gofer_grep_observations':
          result = await mcpToolHandler.grepObservations(
            args.pattern as string,
            (args.maxResults as number) ?? 10
          );
          break;

        // ── Context REPL Tools ──
        case 'gofer_context_peek':
          result = await mcpToolHandler.contextPeek(args.section as string);
          break;

        case 'gofer_context_grep':
          result = await mcpToolHandler.contextGrep(args.pattern as string);
          break;

        case 'gofer_context_fold':
          result = await mcpToolHandler.contextFold(args.section as string);
          break;

        case 'gofer_context_expand':
          result = await mcpToolHandler.contextExpand(args.section as string);
          break;

        case 'gofer_context_undo':
          result = await mcpToolHandler.contextUndo();
          break;

        case 'gofer_context_history':
          result = await mcpToolHandler.contextHistory();
          break;

        case 'gofer_check_slop':
          result = await mcpToolHandler.checkSlop(args.path as string | undefined);
          break;

        case 'gofer_context_repl':
          result = await mcpToolHandler.contextRepl(
            args.operations as Array<Record<string, unknown>>
          );
          break;

        case 'gofer_check_workspace':
          result = await mcpToolHandler.checkWorkspace(args.host as string | undefined);
          break;

        case 'gofer_bootstrap_workspace':
          result = await mcpToolHandler.bootstrapWorkspace({
            host: args.host as string | undefined,
            includeMirrors: args.includeMirrors as boolean | undefined,
            dryRun: args.dryRun as boolean | undefined,
          });
          break;

        case 'gofer_get_pipeline_state':
          result = await mcpToolHandler.getPipelineState();
          break;

        case 'gofer_start_stage':
          result = await mcpToolHandler.startStage(
            args.command as string,
            args.feature as string | undefined
          );
          break;

        case 'gofer_validate_branch':
          result = await mcpToolHandler.validateBranch(args.base as string | undefined);
          break;

        case 'gofer_explain_eai_error':
          result = await mcpToolHandler.explainEaiError(args.codeOrReason as string);
          break;

        case 'gofer_open_artifact':
          result = await mcpToolHandler.openArtifact(
            args.path as string,
            args.maxBytes as number | undefined
          );
          break;

        default:
          throw new ValidationError(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    }).catch((error) => {
      logger.error(`MCP tool ${params.name} failed`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    });
  }
);

// ============================================================================
// STANDARD LSP HANDLERS
// ============================================================================

connection.onDidChangeConfiguration(() => {
  // Handle configuration changes
  logger.debug('Configuration changed');
});

// Text document changes
documents.onDidChangeContent(() => {
  // Handle document changes
  logger.debug('Document content changed');
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

logger.info('Gofer Language Server started');
