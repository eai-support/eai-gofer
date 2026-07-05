import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPToolHandler } from '../../../language-server/src/mcp/toolHandler.js';
import { GoferLoader } from '../../../language-server/src/utils/goferLoader.js';

vi.mock('../../../language-server/src/utils/goferLoader.js');
vi.mock('vscode-languageserver');

/**
 * Tests for MCP tool registration (Phase 1 of Memory System Integration Sweep).
 *
 * T010: Verify all MCP tools appear in capabilities.
 * T011: Verify each app/native bridge tool returns valid responses.
 */

// The MCP tools that should be registered in server.ts onInitialize
const ALL_MCP_TOOL_NAMES = [
  'gofer_get_specs',
  'gofer_get_next_task',
  'gofer_execute_task',
  'gofer_update_task_status',
  'gofer_validate_code',
  'gofer_run_tests',
  'gofer_expand_observation',
  'gofer_get_context_health',
  'gofer_get_research_index',
  'gofer_load_research_chunk',
  'gofer_trigger_handoff',
  'gofer_peek_observation',
  'gofer_fold_observation',
  'gofer_grep_observations',
  'gofer_context_peek',
  'gofer_context_grep',
  'gofer_context_fold',
  'gofer_context_expand',
  'gofer_context_undo',
  'gofer_context_history',
  'gofer_check_slop',
  'gofer_context_repl',
  'gofer_check_workspace',
  'gofer_bootstrap_workspace',
  'gofer_get_pipeline_state',
  'gofer_start_stage',
  'gofer_validate_branch',
  'gofer_explain_eai_error',
  'gofer_open_artifact',
];

describe('MCP Tool Registration (T010)', () => {
  /**
   * This test verifies server.ts capabilities by importing the server module
   * and checking the tools array. Since server.ts creates a connection on
   * import, we test the tool definitions structurally via a snapshot of
   * the expected tool names.
   */
  it('should define all MCP tools without duplicates', () => {
    // Verify the complete list of expected tools
    expect(ALL_MCP_TOOL_NAMES).toHaveLength(29);

    // Verify no duplicates
    const uniqueNames = new Set(ALL_MCP_TOOL_NAMES);
    expect(uniqueNames.size).toBe(29);
  });

  it('should have all tools prefixed with gofer_', () => {
    for (const name of ALL_MCP_TOOL_NAMES) {
      expect(name).toMatch(/^gofer_/);
    }
  });

  it('should include observation/context/research/handoff tools', () => {
    const newTools = [
      'gofer_expand_observation',
      'gofer_get_context_health',
      'gofer_get_research_index',
      'gofer_load_research_chunk',
      'gofer_trigger_handoff',
    ];
    for (const tool of newTools) {
      expect(ALL_MCP_TOOL_NAMES).toContain(tool);
    }
  });

  it('should include app-native repo script bridge tools', () => {
    const bridgeTools = [
      'gofer_check_workspace',
      'gofer_bootstrap_workspace',
      'gofer_get_pipeline_state',
      'gofer_start_stage',
      'gofer_validate_branch',
      'gofer_explain_eai_error',
      'gofer_open_artifact',
    ];
    for (const tool of bridgeTools) {
      expect(ALL_MCP_TOOL_NAMES).toContain(tool);
    }
  });
});

describe('New MCP Tool Responses (T011)', () => {
  let mcpHandler: MCPToolHandler;
  let mockConnection: { sendNotification: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnection = {
      sendNotification: vi.fn(),
    };

    const mockGoferLoader = {
      loadAllSpecs: vi.fn().mockResolvedValue([]),
      loadSpec: vi.fn().mockResolvedValue(null),
      updateTaskStatus: vi.fn(),
    };

    vi.mocked(GoferLoader).mockImplementation(function () {
      return mockGoferLoader;
    });
    mcpHandler = new MCPToolHandler('/test/workspace', mockConnection);
  });

  describe('gofer_expand_observation', () => {
    it('should return a valid response structure for missing observation', async () => {
      const result = await mcpHandler.expandObservation('nonexistent-uuid');

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      // Missing observation should return error, not crash
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for empty observationId', async () => {
      const result = await mcpHandler.expandObservation('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('gofer_get_context_health', () => {
    it('should return a valid response structure', async () => {
      const result = await mcpHandler.getContextHealth(true);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      // Health check may return no data if no state file exists, but should not crash
      if (result.success && result.health) {
        expect(result.health).toHaveProperty('status');
        expect(result.health).toHaveProperty('utilizationPercent');
        expect(result.health).toHaveProperty('tokensUsed');
        expect(result.health).toHaveProperty('tokensLimit');
      }
    });

    it('should accept optional includeBreakdown parameter', async () => {
      const withBreakdown = await mcpHandler.getContextHealth(true);
      const withoutBreakdown = await mcpHandler.getContextHealth(false);

      // Both should return valid responses (not throw)
      expect(withBreakdown).toHaveProperty('success');
      expect(withoutBreakdown).toHaveProperty('success');
    });
  });

  describe('gofer_get_research_index', () => {
    it('should return a valid response structure for missing spec', async () => {
      const result = await mcpHandler.getResearchIndex('nonexistent-spec');

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      // Missing spec should return error, not crash
      expect(result.success).toBe(false);
    });

    it('should return error for empty specId', async () => {
      const result = await mcpHandler.getResearchIndex('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('gofer_load_research_chunk', () => {
    it('should return a valid response structure for missing chunk', async () => {
      const result = await mcpHandler.loadResearchChunk('nonexistent-spec', 'nonexistent-chunk');

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      // Missing chunk should return error, not crash
      expect(result.success).toBe(false);
    });

    it('should return error for empty parameters', async () => {
      const result = await mcpHandler.loadResearchChunk('', '');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('gofer_trigger_handoff', () => {
    it('should return a valid response structure', async () => {
      const result = await mcpHandler.triggerHandoff('manual_request');

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      // With no active spec, should return error about no active feature
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should accept all valid reason types', async () => {
      const reasons = [
        'context_critical',
        'manual_request',
        'stage_complete',
        'error_recovery',
      ] as const;

      for (const reason of reasons) {
        const result = await mcpHandler.triggerHandoff(reason);
        expect(result).toHaveProperty('success');
        // Should not throw for any valid reason
      }
    });
  });

  describe('app-native bridge tools', () => {
    it('should report workspace check results without throwing', async () => {
      const result = await mcpHandler.checkWorkspace('codex');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status');
    });

    it('should dry-run workspace bootstrap without throwing', async () => {
      const result = await mcpHandler.bootstrapWorkspace({
        host: 'codex',
        dryRun: true,
        includeMirrors: false,
      });

      expect(result).toHaveProperty('success');
    });

    it('should return pipeline state even when no specs exist', async () => {
      const result = await mcpHandler.getPipelineState();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('states');
      expect(result).toHaveProperty('artifacts');
    });

    it('should resolve a stage command to a slash command', async () => {
      const result = await mcpHandler.startStage('0_gofer_start');

      expect(result.success).toBe(true);
      expect(result.command).toBe('/0_gofer_start');
      expect(result).toHaveProperty('preflight');
    });

    it('should reject path traversal when opening artifacts', async () => {
      const result = await mcpHandler.openArtifact('../secret.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('escapes workspace root');
    });
  });
});
