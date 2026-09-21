import { describe, expect, it } from 'vitest';
import {
  getUnsupportedFeatureMessage,
  hasCapability,
  supportsMCPServers,
} from '../../../../../extension/src/council/providers/cli/providerCapabilities';

describe('provider MCP capabilities', () => {
  it.each(['claude-cli', 'codex-cli'] as const)('reports MCP support for %s', (providerId) => {
    expect(supportsMCPServers(providerId)).toBe(true);
    expect(hasCapability(providerId, 'mcpServers')).toBe(true);
  });

  it('directs unsupported providers to either current MCP-capable CLI', () => {
    expect(getUnsupportedFeatureMessage('mcp', 'openai')).toContain(
      'Claude Code or Codex CLI',
    );
  });
});
