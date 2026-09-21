import type { MCPToolHandler } from './toolHandler.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  invoke: (handler: MCPToolHandler, args: Record<string, unknown>) => Promise<unknown>;
}

// Metadata and dispatch live together so both transports expose the same contract.
export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  {
    name: 'gofer_get_specs',
    description: 'Get all specifications from the .specify folder',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    invoke: (handler, args) => handler.getSpecs(),
  },
  {
    name: 'gofer_get_next_task',
    description: 'Get the next available task to work on',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    invoke: (handler, args) => handler.getNextTask(),
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
    invoke: (handler, args) => handler.executeTask(args.specId as string, args.taskId as string),
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
    invoke: (handler, args) =>
      handler.updateTaskStatus(args.specId as string, args.taskId as string, args.status as string),
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
    invoke: (handler, args) => handler.validateCode(args.files as string[]),
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
    invoke: (handler, args) =>
      handler.runTestsDetect(
        (args.path as string | undefined) ?? (args.specId as string | undefined),
        args.filter as string | undefined
      ),
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
    invoke: (handler, args) => handler.expandObservation(args.observationId as string),
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
    invoke: (handler, args) => handler.getContextHealth((args.includeBreakdown as boolean) ?? true),
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
    invoke: (handler, args) => handler.getResearchIndex(args.specId as string),
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
    invoke: (handler, args) =>
      handler.loadResearchChunk(args.specId as string, args.chunkId as string),
  },
  {
    name: 'gofer_trigger_handoff',
    description: 'Trigger a session handoff, saving current context state for resumption',
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
    invoke: (handler, args) =>
      handler.triggerHandoff(
        (args.reason as string as
          | 'context_critical'
          | 'manual_request'
          | 'stage_complete'
          | 'error_recovery') || 'manual_request',
        undefined,
        args.specId ? `Spec: ${args.specId as string}` : undefined
      ),
  },
  {
    name: 'gofer_peek_observation',
    description: 'Returns key-points or summary of an observation without full expansion',
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
    invoke: (handler, args) => handler.peekObservation(args.observationId as string),
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
    invoke: (handler, args) =>
      handler.foldObservation(
        args.observationId as string,
        args.foldLevel as 'collapsed' | 'summary' | 'expanded'
      ),
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
          description: 'Maximum number of matching observations to return (default: 10)',
        },
      },
      required: ['pattern'],
    },
    invoke: (handler, args) =>
      handler.grepObservations(args.pattern as string, (args.maxResults as number) ?? 10),
  },
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
    invoke: (handler, args) => handler.contextPeek(args.section as string),
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
    invoke: (handler, args) => handler.contextGrep(args.pattern as string),
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
    invoke: (handler, args) => handler.contextFold(args.section as string),
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
    invoke: (handler, args) => handler.contextExpand(args.section as string),
  },
  {
    name: 'gofer_context_undo',
    description: 'Reverts the last fold/expand operation on observations or context sections',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    invoke: (handler, args) => handler.contextUndo(),
  },
  {
    name: 'gofer_context_history',
    description: 'Shows the last 10 context operations with timestamps',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    invoke: (handler, args) => handler.contextHistory(),
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
    invoke: (handler, args) => handler.checkSlop(args.path as string | undefined),
  },
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
    invoke: (handler, args) =>
      handler.contextRepl(args.operations as Array<Record<string, unknown>>),
  },
  {
    name: 'gofer_check_workspace',
    description:
      'Run the repo-owned Gofer workspace checker and report missing or stale scaffold files',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Host surface to check: auto, codex, claude, copilot, gemini, vscode',
        },
      },
      required: [],
    },
    invoke: (handler, args) => handler.checkWorkspace(args.host as string | undefined),
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
          description: 'Host surface to bootstrap: auto, codex, claude, copilot, gemini, vscode',
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
    invoke: (handler, args) =>
      handler.bootstrapWorkspace({
        host: args.host as string | undefined,
        includeMirrors: args.includeMirrors as boolean | undefined,
        dryRun: args.dryRun as boolean | undefined,
      }),
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
    invoke: (handler, args) => handler.getPipelineState(),
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
          description: 'Stage/helper command name such as 0_gofer_start or /6_gofer_validate',
        },
        feature: {
          type: 'string',
          description: 'Optional feature directory/name to pass through as context',
        },
      },
      required: ['command'],
    },
    invoke: (handler, args) =>
      handler.startStage(args.command as string, args.feature as string | undefined),
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
          description: 'Optional base branch to compare against, defaults to origin/main',
        },
      },
      required: [],
    },
    invoke: (handler, args) => handler.validateBranch(args.base as string | undefined),
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
    invoke: (handler, args) => handler.explainEaiError(args.codeOrReason as string),
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
    invoke: (handler, args) =>
      handler.openArtifact(args.path as string, args.maxBytes as number | undefined),
  },
];

export function legacyToolDefinitions() {
  return TOOL_REGISTRY.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters: structuredClone(parameters),
  }));
}

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}

export async function dispatchTool(
  handler: MCPToolHandler,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const tool = findTool(name);
  if (!tool) throw new Error('Unknown tool: ' + name);
  return tool.invoke(handler, args);
}
