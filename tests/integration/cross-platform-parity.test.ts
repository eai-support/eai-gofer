/**
 * Integration tests for cross-platform Gofer parity.
 *
 * Public surfaces intentionally expose `eai` plus the support-only `eai-update`.
 * The full
 * numbered/helper pipeline remains available as internal `.specify/commands/*`
 * contracts routed by those public entrypoints.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CrossPlatformCommandRouter } from '../../extension/src/council/CrossPlatformCommandRouter';
import {
  FULL_COMMAND_FILES,
  FULL_COMMAND_NAMES,
  PUBLIC_ENTRYPOINT_NAMES,
} from '../helpers/goferCommandSet';

describe('Cross-Platform Feature Parity', () => {
  const workspacePath = process.cwd();
  const publicCommands = [...PUBLIC_ENTRYPOINT_NAMES];
  const internalCommands = [...FULL_COMMAND_NAMES];
  let router: CrossPlatformCommandRouter;

  beforeEach(() => {
    router = new CrossPlatformCommandRouter(workspacePath);
  });

  function readInternalContract(commandFile: string): string {
    return fs.readFileSync(
      path.join(workspacePath, '.specify', 'commands', `${commandFile}.md`),
      'utf8'
    );
  }

  describe('T078: Command Availability', () => {
    it('exposes only public entrypoints in host command surfaces', () => {
      for (const command of publicCommands) {
        for (const platform of [
          'claude',
          'copilot',
          'codex',
          'antigravity',
          'antigravity-desktop',
        ] as const) {
          const commandPath = router.getCommandPath(command, platform);
          expect(fs.existsSync(commandPath), `${command} missing on ${platform}`).toBe(true);
          expect(fs.readFileSync(commandPath, 'utf8').trim().length).toBeGreaterThan(20);
        }
      }

      for (const hiddenCommand of ['0_gofer_start', '1_gofer_research', 'gofer:diagnose']) {
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'claude'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'copilot'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'codex'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'antigravity'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'antigravity-desktop'))).toBe(
          false
        );
      }
    });

    it('keeps all internal command contracts available under .specify/commands', () => {
      for (const commandFile of FULL_COMMAND_FILES) {
        const commandPath = path.join(workspacePath, '.specify', 'commands', `${commandFile}.md`);
        expect(fs.existsSync(commandPath), `${commandFile} internal contract missing`).toBe(true);
        expect(fs.readFileSync(commandPath, 'utf8').trim().length).toBeGreaterThan(100);
      }
    });

    it('lists public commands without leaking the internal command set', async () => {
      const availableCommands = await router.listCommands();

      expect(availableCommands).toEqual(expect.arrayContaining(publicCommands));
      for (const internalCommand of internalCommands) {
        expect(availableCommands).not.toContain(internalCommand);
      }
    });

    it('provides clean public command syntax for each platform', () => {
      expect(router.getCommandSyntax('eai', 'claude')).toBe('/eai');
      expect(router.getCommandSyntax('eai', 'copilot')).toBe('#eai');
      expect(router.getCommandSyntax('eai', 'codex')).toBe('/eai');
      expect(router.getCommandSyntax('eai', 'antigravity')).toBe('/eai');
      expect(router.getCommandSyntax('eai', 'antigravity-desktop')).toBe('/eai');
      expect(router.getCommandSyntax('eai-update', 'claude')).toBe('/eai-update');
      expect(router.getCommandSyntax('eai-update', 'copilot')).toBe('#eai-update');
      expect(router.getCommandSyntax('eai-update', 'codex')).toBe('/eai-update');
      expect(router.getCommandSyntax('eai-update', 'antigravity')).toBe('/eai-update');
      expect(router.getCommandSyntax('eai-update', 'antigravity-desktop')).toBe('/eai-update');
    });

    it('rejects Gemini CLI rather than silently choosing another surface', () => {
      expect(() => router.getCommandPath('eai', 'gemini')).toThrow(/Gemini CLI is retired/);
      expect(() => router.getCommandSyntax('eai', 'gemini')).toThrow(/Gemini CLI is retired/);
    });
  });

  describe('T079: Auto-Chain Functionality', () => {
    it('keeps auto-chain instructions in each internal stage contract', () => {
      const pipelineStages = [
        '1_gofer_research',
        '2_gofer_specify',
        '3_gofer_plan',
        '4_gofer_tasks',
        '5_gofer_implement',
        '6_gofer_validate',
      ];

      pipelineStages.forEach((stage, index) => {
        const content = readInternalContract(stage);

        if (index < pipelineStages.length - 1) {
          expect(content.toLowerCase()).toContain('auto-chain');
          expect(content).toContain(pipelineStages[index + 1]);
        }
      });
    });

    it('keeps continuation guidance in the main public entrypoint wrapper', () => {
      for (const command of ['eai']) {
        const content = fs.readFileSync(router.getCommandPath(command, 'claude'), 'utf8');
        expect(content).toContain('.specify/commands/*.md');
        expect(content.toLowerCase()).toMatch(/route|continue|internal/);
      }
    });

    it('keeps the update entrypoint independent of a repository scaffold', () => {
      for (const platform of [
        'claude',
        'copilot',
        'codex',
        'antigravity',
        'antigravity-desktop',
      ] as const) {
        const content = fs.readFileSync(router.getCommandPath('eai-update', platform), 'utf8');
        expect(content).toContain('works without an EAI project');
        expect(content).toContain('Do not run workspace checks');
        expect(content).toContain('gofer-surface-update.mjs');
      }
    });
  });

  describe('T080: Parallel Agent Spawning', () => {
    it('keeps parallel validation agent instructions in the internal validation contract', () => {
      const content = readInternalContract('6_gofer_validate');

      expect(content.toLowerCase()).toContain('parallel');
      expect(content).toContain('Task');
      for (const agentName of [
        'validation-correctness',
        'validation-security',
        'validation-performance',
        'validation-test-quality',
        'validation-integration',
        'validation-standards',
      ]) {
        expect(content).toContain(agentName);
      }
    });

    it('has 6 validation agents defined', () => {
      const agentsDir = path.join(workspacePath, '.claude/agents');
      const validationAgents = fs
        .readdirSync(agentsDir)
        .filter((file) => file.startsWith('validation-') && file.endsWith('.md'));

      expect(validationAgents.length).toBe(6);
    });
  });

  describe('T082: Output Structure Equivalence', () => {
    it('specifies standard output sections in internal stage contracts', () => {
      expect(readInternalContract('1_gofer_research')).toContain('Feature Summary');
      expect(readInternalContract('1_gofer_research')).toContain('Codebase Analysis');
      expect(readInternalContract('2_gofer_specify')).toContain('Functional Requirements');
      expect(readInternalContract('2_gofer_specify')).toContain('Success Criteria');
      expect(readInternalContract('6_gofer_validate').toLowerCase()).toContain('validation');
      expect(readInternalContract('6_gofer_validate').toLowerCase()).toContain('score');
    });
  });

  describe('US-006: Public Mirror Parity Assertions', () => {
    it('keeps full skill content in parity except for explicit shared-host selection', () => {
      const sharedGuidance =
        'This skill is shared by Codex, Antigravity CLI, and Antigravity desktop. Replace `<host>` in every command below with `codex`, `antigravity`, or `antigravity-desktop` for the actual app. Never execute an unresolved placeholder or infer the host from this shared folder. Keep `GEMINI.md` and `AGENTS.md`. Gemini CLI is retired; migrate to Antigravity. Workspace files do not prove native skill discovery or model execution.';
      publicCommands.forEach((commandName) => {
        const agentSkillPath = router.getCommandPath(commandName, 'codex');
        const relativeSkillPath = path.relative(
          path.join(workspacePath, '.agents', 'skills'),
          agentSkillPath
        );
        const systemSkillPath = path.join(workspacePath, '.system', 'skills', relativeSkillPath);

        expect(fs.existsSync(agentSkillPath)).toBe(true);
        expect(fs.existsSync(systemSkillPath)).toBe(true);
        const shared = fs.readFileSync(agentSkillPath, 'utf8');
        expect(shared).toContain(sharedGuidance);
        expect(router.getCommandPath(commandName, 'antigravity')).toBe(agentSkillPath);
        expect(router.getCommandPath(commandName, 'antigravity-desktop')).toBe(agentSkillPath);
        const codexEquivalent = shared
          .replace('Host: Codex / Antigravity CLI / Antigravity desktop', 'Host: Codex')
          .replace(sharedGuidance, '')
          .replaceAll('--host <host>', '--host codex');
        expect(fs.readFileSync(systemSkillPath, 'utf8')).toBe(codexEquivalent);
      });
    });
  });

  describe('Cross-Platform Command Router', () => {
    it('detects public command availability correctly', () => {
      expect(router.isCommandAvailable('gofer')).toBe(false);
      expect(router.isCommandAvailable('eai')).toBe(true);
      expect(router.isCommandAvailable('1_gofer_research')).toBe(false);
      expect(router.isCommandAvailable('nonexistent_command')).toBe(false);
    });

    it('loads public command content for available commands', async () => {
      const content = await router.loadSkillForPlatform('eai', 'claude');

      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('#');
    });

    it('throws for unavailable public-surface commands', async () => {
      await expect(router.loadSkillForPlatform('1_gofer_research', 'claude')).rejects.toThrow();
    });
  });
});
