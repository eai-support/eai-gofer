import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { propagateCanonicalMirrors } from '../../../extension/src/services/enterpriseai/internalApi/PropagateCanonicalMirrors';
import { createMirrorPropagationEventHandlers } from '../../../extension/src/services/enterpriseai/events/MirrorPropagationEvents';

describe('enterpriseai canonical mirror parity (root integration)', () => {
  it('keeps the delivery contract while shared skills identify the actual host explicitly', () => {
    const commandName = 'eai';
    const codexPath = path.join(process.cwd(), '.system', 'skills', commandName, 'SKILL.md');
    const agentPath = path.join(process.cwd(), '.agents', 'skills', commandName, 'SKILL.md');

    expect(fs.existsSync(codexPath)).toBe(true);
    expect(fs.existsSync(agentPath)).toBe(true);
    const shared = fs.readFileSync(agentPath, 'utf8');
    const codex = fs.readFileSync(codexPath, 'utf8');
    expect(shared).toContain('Codex / Antigravity CLI / Antigravity desktop');
    expect(shared).toContain('--host <host>');
    expect(codex).toContain('--host codex');
    // Only the host label and host-specific preflight differ, not the delivery rules.
    const deliveryContract = (content: string): string =>
      content
        .replace(/^Host: .*$/m, 'Host: <client>')
        .replace(/## Workspace Preflight[\s\S]*?(?=## Local Settings Cleanup Contract)/, '');
    expect(deliveryContract(shared)).toBe(deliveryContract(codex));
  });

  it('implements IAP-008 propagation with EVT-008 payload emission', async () => {
    const publishedPayloads: Array<Record<string, unknown>> = [];
    const result = await propagateCanonicalMirrors(
      {
        changeSetId: 'chg_029_phase8',
        canonicalSources: ['.specify/commands/1_gofer_research.md'],
        targetMirrors: ['.github/prompts', '.agents/skills', 'antigravity', 'antigravity-desktop'],
        runParityValidation: true,
      },
      {
        workspaceRoot: process.cwd(),
        filesChangedOverride: 4,
        eventPublisher: (payload): void => {
          publishedPayloads.push(payload as unknown as Record<string, unknown>);
        },
      }
    );

    expect(result.contractId).toBe('IAP-008');
    expect(result.response.status).toBe('completed');
    expect(result.response.parityValidation).toBe('passed');
    expect(result.response.runtimeSyncCompleted).toBe(true);
    expect(result.response.mirrorsUpdated).toBe(4);
    expect(result.response.records).toHaveLength(4);
    expect(new Set(result.response.records.map((record) => record.propagationId)).size).toBe(4);
    for (const surface of ['antigravity', 'antigravity-desktop']) {
      expect(
        result.response.records.find((record) => record.targetPlatform === surface)?.targetPath
      ).toBe(path.join(process.cwd(), '.agents', 'skills'));
    }
    result.response.records.forEach((record) => {
      expect(record.syncStatus).toBe('synced');
      expect(record.parityDiffCount).toBe(0);
    });

    expect(result.emittedEvent.contractId).toBe('EVT-008');
    expect(result.emittedEvent.payload.changeSetId).toBe('chg_029_phase8');
    expect(result.emittedEvent.payload.mirrors).toEqual([
      'copilot',
      'codex',
      'antigravity',
      'antigravity-desktop',
    ]);
    expect(publishedPayloads).toHaveLength(1);
  });

  it('publishes and consumes EVT-008 while triggering parity validation', () => {
    const parityTrigger = vi.fn();
    const receivedPayloads: Array<Record<string, unknown>> = [];
    const handlers = createMirrorPropagationEventHandlers((payload): void => {
      parityTrigger(payload);
    });

    const unsubscribe = handlers.consume((payload): void => {
      receivedPayloads.push(payload as unknown as Record<string, unknown>);
    });

    handlers.publish({
      eventId: 'evt_008_test',
      changeSetId: 'chg_029_phase8',
      mirrors: ['copilot', 'codex', 'antigravity', 'antigravity-desktop'],
      filesChanged: 9,
      runtimeSyncCompleted: true,
    });

    expect(parityTrigger).toHaveBeenCalledTimes(1);
    expect(receivedPayloads).toHaveLength(1);
    expect(handlers.consumerCount()).toBe(1);

    unsubscribe();
    expect(handlers.consumerCount()).toBe(0);
  });
});
