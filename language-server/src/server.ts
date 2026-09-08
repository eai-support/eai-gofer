import { dispatchTool, legacyToolDefinitions } from './mcp/toolRegistry.js';
import { fileURLToPath } from 'node:url';
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
      const resolvedWorkspacePath = fileURLToPath(params.workspaceFolders[0].uri);
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
            tools: legacyToolDefinitions(),
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

      const result = await dispatchTool(mcpToolHandler, name, args);

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
