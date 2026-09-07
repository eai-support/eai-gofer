import { TOOL_REGISTRY, type ToolDefinition } from './toolRegistry.js';

export interface ToolPermissions {
  allowWrite: boolean;
  allowExecution: boolean;
  allowWorkspaceTools: boolean;
}

type Permission = 'bounded-read' | 'write' | 'execution' | 'trusted-workspace';

// These are reviewed capabilities, not model-controlled approval arguments.
// Repository execution can also write files, so it requires both narrow flags.
const PERMISSIONS: Record<string, Permission> = {
  gofer_get_specs: 'bounded-read',
  gofer_get_next_task: 'bounded-read',
  gofer_execute_task: 'write',
  gofer_update_task_status: 'write',
  gofer_validate_code: 'trusted-workspace',
  gofer_run_tests: 'execution',
  gofer_expand_observation: 'trusted-workspace',
  gofer_get_context_health: 'trusted-workspace',
  gofer_get_research_index: 'write',
  gofer_load_research_chunk: 'write',
  gofer_trigger_handoff: 'write',
  gofer_peek_observation: 'trusted-workspace',
  gofer_fold_observation: 'write',
  gofer_grep_observations: 'trusted-workspace',
  gofer_context_peek: 'trusted-workspace',
  gofer_context_grep: 'trusted-workspace',
  gofer_context_fold: 'write',
  gofer_context_expand: 'write',
  gofer_context_undo: 'write',
  gofer_context_history: 'trusted-workspace',
  gofer_check_slop: 'trusted-workspace',
  gofer_context_repl: 'write',
  gofer_check_workspace: 'execution',
  gofer_bootstrap_workspace: 'execution',
  gofer_get_pipeline_state: 'bounded-read',
  gofer_start_stage: 'bounded-read',
  gofer_validate_branch: 'execution',
  gofer_explain_eai_error: 'execution',
  gofer_open_artifact: 'bounded-read',
};

export function permissionRequirement(name: string): string | undefined {
  switch (PERMISSIONS[name]) {
    case 'bounded-read':
      return undefined;
    case 'write':
      return '--allow-workspace-tools (legacy writes are not workspace-confined)';
    case 'execution':
      return '--allow-write and --allow-execution';
    default:
      return '--allow-workspace-tools';
  }
}

export function assertToolPermission(name: string, permissions: ToolPermissions): void {
  const capability = PERMISSIONS[name];
  if (!capability) throw new Error('Permission denied: tool has no reviewed capability');
  if (
    capability === 'bounded-read' ||
    permissions.allowWorkspaceTools ||
    (capability === 'execution' && permissions.allowWrite && permissions.allowExecution)
  )
    return;
  throw new Error(
    `Permission denied: ${name} requires trusted host startup ${permissionRequirement(name)}. Tool arguments cannot grant approval.`
  );
}

function boundedSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...(value as Record<string, unknown>) };
  if (result.type === 'object') {
    result.additionalProperties = false;
    result.maxProperties = 32;
    if (result.properties)
      result.properties = Object.fromEntries(
        Object.entries(result.properties as Record<string, unknown>).map(([key, item]) => [
          key,
          boundedSchema(item),
        ])
      );
  }
  if (result.type === 'string') result.maxLength = 4096;
  if (result.type === 'array') {
    result.maxItems = 50;
    if (result.items) result.items = boundedSchema(result.items);
  }
  if (result.type === 'number' || result.type === 'integer') {
    result.type = 'integer';
    result.minimum = 0;
    result.maximum = 100000;
  }
  return result;
}

export function mcpToolDefinition(tool: ToolDefinition) {
  const inputSchema = boundedSchema(tool.parameters) as ToolDefinition['parameters'];
  if (tool.name === 'gofer_open_artifact') {
    inputSchema.properties.maxBytes = { type: 'integer', minimum: 1, maximum: 100000 };
  }
  if (tool.name === 'gofer_context_repl') {
    inputSchema.properties.operations = {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              op: { type: 'string', enum: ['fold', 'expand', 'peek'] },
              target: { type: 'string', minLength: 1, maxLength: 4096 },
              age: { type: 'integer', minimum: 0, maximum: 100000 },
            },
            required: ['op', 'target'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              op: { const: 'fold-all-older-than' },
              target: { type: 'string', maxLength: 4096 },
              age: { type: 'integer', minimum: 0, maximum: 100000 },
            },
            required: ['op', 'age'],
          },
        ],
      },
    };
  }
  const requirement = permissionRequirement(tool.name);
  return {
    name: tool.name,
    description: `${tool.description}${requirement ? ` Requires trusted startup ${requirement} (or broad --allow-workspace-tools).` : ''}`,
    inputSchema,
    // Never declare every legacy tool read-only. Omission retains conservative SDK defaults.
    ...(PERMISSIONS[tool.name] === 'bounded-read'
      ? { annotations: { readOnlyHint: true, openWorldHint: false } }
      : {}),
  };
}

export const MCP_TOOL_DEFINITIONS = TOOL_REGISTRY.map(mcpToolDefinition);
