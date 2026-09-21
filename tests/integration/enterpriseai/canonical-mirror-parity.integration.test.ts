import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { propagateCanonicalMirrors } from '../../../extension/src/services/enterpriseai/internalApi/PropagateCanonicalMirrors';
import { createMirrorPropagationEventHandlers } from '../../../extension/src/services/enterpriseai/events/MirrorPropagationEvents';

function normalizeSharedAgentSkill(content: string): string {
  return content
    .replace(/^Host:.*$/m, 'Host: <semantic-host>')
    .replace(/^This skill is shared by Codex and Google Antigravity\..*\n?/m, '')
    .replace(
      /^2\. This skill is shared by Codex and Google Antigravity\..*$/m,
      '2. Select the current semantic host.'
    )
    .replace(
      /^2\. Use `codex` as the current semantic host\.$/m,
      '2. Select the current semantic host.'
    )
    .replace(/--host (?:codex|<current-host>)/g, '--host <semantic-host>')
    .replace(/\n{3,}/g, '\n\n');
}

describe('enterpriseai canonical mirror parity (root integration)', () => {
  it('keeps .system and shared .agents skills equal apart from semantic host selection', () => {
    const commandName = 'eai';
    const codexPath = path.join(process.cwd(), '.system', 'skills', commandName, 'SKILL.md');
    const agentPath = path.join(process.cwd(), '.agents', 'skills', commandName, 'SKILL.md');

    expect(fs.existsSync(codexPath)).toBe(true);
    expect(fs.existsSync(agentPath)).toBe(true);
    const agentSkill = fs.readFileSync(agentPath, 'utf8');
    const codexSkill = fs.readFileSync(codexPath, 'utf8');
    expect(agentSkill).toContain('Google Antigravity');
    expect(codexSkill).toContain('Host: Codex');
    expect(normalizeSharedAgentSkill(agentSkill)).toBe(normalizeSharedAgentSkill(codexSkill));
  });

  it('implements IAP-008 propagation with EVT-008 payload emission', async () => {
    const publishedPayloads: Array<Record<string, unknown>> = [];
    const result = await propagateCanonicalMirrors(
      {
        changeSetId: 'chg_029_phase8',
        canonicalSources: ['.specify/commands/1_gofer_research.md'],
        targetMirrors: ['.github/prompts', '.agents/skills', '.gemini/commands/gofer'],
        runParityValidation: true,
      },
      {
        workspaceRoot: process.cwd(),
        filesChangedOverride: 3,
        eventPublisher: (payload): void => {
          publishedPayloads.push(payload as unknown as Record<string, unknown>);
        },
      }
    );

    expect(result.contractId).toBe('IAP-008');
    expect(result.response.status).toBe('completed');
    expect(result.response.parityValidation).toBe('passed');
    expect(result.response.runtimeSyncCompleted).toBe(true);
    expect(result.response.mirrorsUpdated).toBe(3);
    expect(result.response.records).toHaveLength(3);
    result.response.records.forEach((record) => {
      expect(record.syncStatus).toBe('synced');
      expect(record.parityDiffCount).toBe(0);
    });

    expect(result.emittedEvent.contractId).toBe('EVT-008');
    expect(result.emittedEvent.payload.changeSetId).toBe('chg_029_phase8');
    expect(result.emittedEvent.payload.mirrors).toEqual(['copilot', 'codex', 'gemini']);
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
      mirrors: ['copilot', 'codex', 'gemini'],
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
