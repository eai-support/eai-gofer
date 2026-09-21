import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchTool,
  legacyToolDefinitions,
  TOOL_REGISTRY,
} from '../../../language-server/src/mcp/toolRegistry.js';
import {
  assertToolPermission,
  MCP_TOOL_DEFINITIONS,
} from '../../../language-server/src/mcp/toolPolicy.js';
import { parseStartupOptions } from '../../../language-server/src/mcpServer.js';
import type { MCPToolHandler } from '../../../language-server/src/mcp/toolHandler.js';

const require = createRequire(new URL('../../../language-server/package.json', import.meta.url));
const { AjvJsonSchemaValidator } = require('@modelcontextprotocol/sdk/validation/ajv');
const validator = new AjvJsonSchemaValidator();
const defaults = { allowWrite: false, allowExecution: false, allowWorkspaceTools: false };
const safe = [
  'gofer_get_specs',
  'gofer_get_next_task',
  'gofer_get_pipeline_state',
  'gofer_start_stage',
  'gofer_open_artifact',
];
const args = {
  specId: '001-feature',
  taskId: 'T001',
  status: 'completed',
  files: ['a.ts'],
  path: 'docs/a.md',
  filter: 'test',
  observationId: 'obs-123',
  includeBreakdown: false,
  chunkId: 'chunk-1',
  reason: 'manual_request',
  foldLevel: 'summary',
  pattern: 'needle',
  maxResults: 4,
  section: 'specs',
  operations: [{ op: 'peek', target: 'specs' }],
  host: 'codex',
  includeMirrors: false,
  dryRun: true,
  command: '/0_gofer_start',
  feature: 'feature',
  base: 'origin/main',
  codeOrReason: 'TEST_ERROR',
  maxBytes: 17,
};
const bindings: Array<[string, string, unknown[]]> = [
  ['gofer_get_specs', 'getSpecs', []],
  ['gofer_get_next_task', 'getNextTask', []],
  ['gofer_execute_task', 'executeTask', [args.specId, args.taskId]],
  ['gofer_update_task_status', 'updateTaskStatus', [args.specId, args.taskId, args.status]],
  ['gofer_validate_code', 'validateCode', [args.files]],
  ['gofer_run_tests', 'runTestsDetect', [args.path, args.filter]],
  ['gofer_expand_observation', 'expandObservation', [args.observationId]],
  ['gofer_get_context_health', 'getContextHealth', [false]],
  ['gofer_get_research_index', 'getResearchIndex', [args.specId]],
  ['gofer_load_research_chunk', 'loadResearchChunk', [args.specId, args.chunkId]],
  ['gofer_trigger_handoff', 'triggerHandoff', [args.reason, undefined, `Spec: ${args.specId}`]],
  ['gofer_peek_observation', 'peekObservation', [args.observationId]],
  ['gofer_fold_observation', 'foldObservation', [args.observationId, args.foldLevel]],
  ['gofer_grep_observations', 'grepObservations', [args.pattern, args.maxResults]],
  ['gofer_context_peek', 'contextPeek', [args.section]],
  ['gofer_context_grep', 'contextGrep', [args.pattern]],
  ['gofer_context_fold', 'contextFold', [args.section]],
  ['gofer_context_expand', 'contextExpand', [args.section]],
  ['gofer_context_undo', 'contextUndo', []],
  ['gofer_context_history', 'contextHistory', []],
  ['gofer_check_slop', 'checkSlop', [args.path]],
  ['gofer_context_repl', 'contextRepl', [args.operations]],
  ['gofer_check_workspace', 'checkWorkspace', [args.host]],
  [
    'gofer_bootstrap_workspace',
    'bootstrapWorkspace',
    [{ host: args.host, includeMirrors: false, dryRun: true }],
  ],
  ['gofer_get_pipeline_state', 'getPipelineState', []],
  ['gofer_start_stage', 'startStage', [args.command, args.feature]],
  ['gofer_validate_branch', 'validateBranch', [args.base]],
  ['gofer_explain_eai_error', 'explainEaiError', [args.codeOrReason]],
  ['gofer_open_artifact', 'openArtifact', [args.path, args.maxBytes]],
];

describe('Shared MCP dispatch and safety contract', () => {
  it('covers exactly the live registry and does not expose mutable schemas', () => {
    expect(TOOL_REGISTRY.map((tool) => tool.name)).toEqual(bindings.map(([name]) => name));
    const definitions = legacyToolDefinitions();
    definitions[0].parameters.required.push('injected');
    expect(legacyToolDefinitions()[0].parameters.required).toEqual([]);
  });

  it.each(bindings)(
    '%s dispatches only to %s with unchanged arguments',
    async (name, method, expected) => {
      const handler = Object.fromEntries(
        bindings.map(([, method]) => [method, vi.fn().mockResolvedValue({ success: true })])
      );
      expect(await dispatchTool(handler as unknown as MCPToolHandler, name, args)).toEqual({
        success: true,
      });
      expect(handler[method]).toHaveBeenCalledExactlyOnceWith(...expected);
      expect(
        Object.values(handler).reduce((count, mock) => count + mock.mock.calls.length, 0)
      ).toBe(1);
    }
  );

  it('preserves optional defaults and the old run-tests specId alias', async () => {
    const handler = {
      runTestsDetect: vi.fn(),
      getContextHealth: vi.fn(),
      grepObservations: vi.fn(),
      triggerHandoff: vi.fn(),
    };
    const typed = handler as unknown as MCPToolHandler;
    await dispatchTool(typed, 'gofer_run_tests', { specId: 'legacy', filter: 'test' });
    expect(handler.runTestsDetect).toHaveBeenCalledWith('legacy', 'test');
    await dispatchTool(typed, 'gofer_get_context_health');
    expect(handler.getContextHealth).toHaveBeenCalledWith(true);
    await dispatchTool(typed, 'gofer_grep_observations', { pattern: 'x', maxResults: 0 });
    expect(handler.grepObservations).toHaveBeenCalledWith('x', 0);
    await dispatchTool(typed, 'gofer_trigger_handoff');
    expect(handler.triggerHandoff).toHaveBeenCalledWith('manual_request', undefined, undefined);
    await expect(dispatchTool(typed, 'constructor')).rejects.toThrow('Unknown tool');
  });

  it.each(MCP_TOOL_DEFINITIONS)(
    '$name requires startup permission unless reviewed as bounded-read',
    (tool) => {
      const invoke = vi.fn();
      const dispatch = () => {
        assertToolPermission(tool.name, defaults);
        invoke();
      };
      if (safe.includes(tool.name)) {
        expect(dispatch).not.toThrow();
        expect(invoke).toHaveBeenCalledOnce();
      } else {
        expect(dispatch).toThrow('Permission denied');
        expect(invoke).not.toHaveBeenCalled();
      }
      expect(tool.annotations?.readOnlyHint === true).toBe(safe.includes(tool.name));
    }
  );

  it('requires broad trust for unqualified writes, and both narrow flags for execution', () => {
    for (const permission of [{ allowWrite: true }, { allowExecution: true }]) {
      expect(() =>
        assertToolPermission('gofer_check_workspace', { ...defaults, ...permission })
      ).toThrow();
    }
    expect(() =>
      assertToolPermission('gofer_check_workspace', {
        ...defaults,
        allowWrite: true,
        allowExecution: true,
      })
    ).not.toThrow();
    for (const name of [
      'gofer_execute_task',
      'gofer_update_task_status',
      'gofer_get_research_index',
      'gofer_load_research_chunk',
    ]) {
      expect(() => assertToolPermission(name, { ...defaults, allowWrite: true })).toThrow(
        '--allow-workspace-tools'
      );
    }
    for (const tool of MCP_TOOL_DEFINITIONS)
      expect(() =>
        assertToolPermission(tool.name, { ...defaults, allowWorkspaceTools: true })
      ).not.toThrow();
    expect(() =>
      assertToolPermission('unreviewed', { ...defaults, allowWorkspaceTools: true })
    ).toThrow();
  });

  it('rejects non-finite, fractional, oversized and model-approval arguments', () => {
    const validate = validator.getValidator(
      MCP_TOOL_DEFINITIONS.find((tool) => tool.name === 'gofer_open_artifact')!.inputSchema
    );
    for (const maxBytes of [NaN, Infinity, -Infinity, -1, 0, 1.5, 100001, '100'])
      expect(validate({ path: 'docs/a.md', maxBytes }).valid).toBe(false);
    expect(validate({ path: 'x'.repeat(4097) }).valid).toBe(false);
    expect(validate({ path: 'docs/a.md', approved: true }).valid).toBe(false);
    expect(validate({ path: 'docs/a.md', maxBytes: 1 }).valid).toBe(true);
  });

  it('admits all four actual context operations, not arbitrary objects', () => {
    const validate = validator.getValidator(
      MCP_TOOL_DEFINITIONS.find((tool) => tool.name === 'gofer_context_repl')!.inputSchema
    );
    for (const op of ['fold', 'expand', 'peek'])
      expect(validate({ operations: [{ op, target: 'section', age: 1 }] }).valid).toBe(true);
    expect(validate({ operations: [{ op: 'fold-all-older-than', age: 1 }] }).valid).toBe(true);
    for (const operations of [
      [],
      [{ op: 'arbitrary' }],
      [{ op: 'fold' }],
      [{ op: 'peek', target: 'x', approved: true }],
      Array(51).fill({ op: 'peek', target: 'x' }),
    ])
      expect(validate({ operations }).valid).toBe(false);
  });

  it('requires explicit startup root and rejects duplicate or unknown flags', () => {
    for (const flags of [
      [],
      ['--workspace-root'],
      ['--workspace-root', '/tmp', '--approved'],
      ['--workspace-root', '/tmp', '--allow-write', '--allow-write'],
    ])
      expect(() => parseStartupOptions(flags)).toThrow();
    expect(parseStartupOptions(['--workspace-root', '/tmp'])).toEqual({
      ...defaults,
      workspaceRoot: '/tmp',
    });
  });
});
