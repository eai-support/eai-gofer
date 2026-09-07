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
import { buildContinuationContractSection } from '../../.specify/scripts/node/generate-commands.mjs';
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
        for (const platform of ['claude', 'copilot', 'codex', 'gemini'] as const) {
          const commandPath = router.getCommandPath(command, platform);
          expect(fs.existsSync(commandPath), `${command} missing on ${platform}`).toBe(true);
          expect(fs.readFileSync(commandPath, 'utf8').trim().length).toBeGreaterThan(20);
        }
      }

      for (const hiddenCommand of ['0_gofer_start', '1_gofer_research', 'gofer:diagnose']) {
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'claude'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'copilot'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'codex'))).toBe(false);
        expect(fs.existsSync(router.getCommandPath(hiddenCommand, 'gemini'))).toBe(false);
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
      expect(router.getCommandSyntax('eai', 'gemini')).toBe('/eai');
      expect(router.getCommandSyntax('eai-update', 'claude')).toBe('/eai-update');
      expect(router.getCommandSyntax('eai-update', 'copilot')).toBe('#eai-update');
      expect(router.getCommandSyntax('eai-update', 'codex')).toBe('/eai-update');
      expect(router.getCommandSyntax('eai-update', 'gemini')).toBe('/eai-update');
    });
  });

  describe('T079: Internal-File Continuation', () => {
    const pipelineStages = [
      '0_gofer_start',
      '0a_problem_validation',
      '1_gofer_research',
      '2_gofer_specify',
      '3_gofer_plan',
      '4_gofer_tasks',
      '5_gofer_implement',
      '6_gofer_validate',
    ];
    const compact = (content: string) => content.replace(/\s+/g, ' ');

    function expectSharedContinuation(content: string): void {
      expect(content.match(/<!-- gofer:continuation:start -->/g)).toHaveLength(1);
      expect(content.match(/<!-- gofer:continuation:end -->/g)).toHaveLength(1);
      expect(content).toContain(buildContinuationContractSection());
      expect(content).not.toMatch(/Skill tool|skill=["`]\/?\d/);
      expect(content).toContain('read and follow the next internal file in .specify/commands/');
      expect(content).toContain('in the same conversation');
      expect(content).toContain('Progress, Stop reason and Next action');
      expect(content).toContain('missing or ambiguous approval is not approval');
      expect(content).toContain('explicit plan/task approval requirement');
      expect(content).toContain(
        'Pause for material scope, security, cost, deployment, destructive'
      );
      expect(content).toContain('Business approval does not authorize publishing');
      expect(content).toContain('A tool proposal is not execution');
      expect(content).toContain('If host consent is required, wait for it');
    }

    it.each(pipelineStages)('preserves shared continuation and approval gates in %s', (stage) => {
      expectSharedContinuation(readInternalContract(stage));
    });

    it.each([
      ['0a_problem_validation', '1_gofer_research'],
      ['1_gofer_research', '2_gofer_specify'],
      ['2_gofer_specify', '3_gofer_plan'],
      ['3_gofer_plan', '4_gofer_tasks'],
      ['4_gofer_tasks', '5_gofer_implement'],
      ['5_gofer_implement', '6_gofer_validate'],
    ])('continues %s by reading the existing %s contract', (stage, next) => {
      const content = compact(readInternalContract(stage)).toLowerCase();
      expect(content).toContain(`read and follow \`.specify/commands/${next}.md\``);
      expect(fs.existsSync(path.join(workspacePath, '.specify/commands', `${next}.md`))).toBe(true);
    });

    it('routes kickoff internally and keeps problem validation optional', () => {
      expect(readInternalContract('0_gofer_start')).toContain(
        'Read the selected internal contract from `.specify/commands/{stage}.md`'
      );
      expect(compact(readInternalContract('0a_problem_validation'))).toContain(
        'This helper remains optional in the full pipeline'
      );
    });

    it('honors requested research-only work rather than stopping every research stage', () => {
      const content = compact(readInternalContract('1_gofer_research'));
      expect(content).toContain(
        'Unless the user explicitly asks to stop after research or a real gate blocks progress'
      );
      expect(content).toContain(
        'For requested research-only work, report that scope complete without claiming the delivery pipeline is complete'
      );
    });

    it('checks business approval and reuses only task authorization already covered', () => {
      expect(compact(readInternalContract('2_gofer_specify'))).toContain(
        'Before continuing to planning, verify approval of the business specification and its scope'
      );
      const tasks = compact(readInternalContract('4_gofer_tasks'));
      expect(tasks).toContain(
        'If the approved business scope already covers these tasks and no outstanding explicit plan/task approval or material-change gate applies'
      );
      expect(tasks).toContain('Otherwise, pause for the required approval');
      expect(tasks).toContain(
        'Missing, ambiguous, rejected or revoked approval is not authorization'
      );
      expect(tasks).toContain(
        'record `approvalBasis` with the original approval source and covered scope'
      );
      expect(tasks).toContain('Do not fabricate a fresh user approval, approver or timestamp');
    });

    it('keeps validation terminal only when the requested evidence passes', () => {
      const content = readInternalContract('6_gofer_validate');
      expect(content).toContain(
        "At validation, report completion only when the requested scope's required evidence passes; failures remain unfinished work"
      );
      expect(content).toContain('Stage completion alone is not pipeline completion');
      expect(content).toContain('budget, context and retry limits');
      expect(content).not.toContain('Next internal contract:');
    });

    it.each(['claude', 'copilot', 'codex', 'gemini'] as const)(
      'preserves the same continuation and approval contract in the %s public wrapper',
      (platform) => {
        const wrapperPath =
          platform === 'gemini'
            ? path.join(workspacePath, '.gemini/commands/gofer/eai.md')
            : router.getCommandPath('eai', platform);
        const content = fs.readFileSync(wrapperPath, 'utf8');
        expect(content).toContain('.specify/commands/*.md');
        expectSharedContinuation(content);
      }
    );

    it('keeps the update entrypoint independent of a repository scaffold', () => {
      for (const platform of ['claude', 'copilot', 'codex'] as const) {
        const content = fs.readFileSync(router.getCommandPath('eai-update', platform), 'utf8');
        expect(content).toContain('works without an EAI project');
        expect(content).toContain('Do not run workspace checks');
        expect(content).toContain('gofer-surface-update.mjs');
      }
      const geminiContent = fs.readFileSync(
        path.join(workspacePath, '.gemini', 'commands', 'gofer', 'eai-update.md'),
        'utf8'
      );
      expect(geminiContent).toContain('works without an EAI project');
      expect(geminiContent).toContain('Do not run workspace checks');
      expect(geminiContent).toContain('gofer-surface-update.mjs');
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
    it('keeps .agents skills in parity with .system skills for public entrypoints', () => {
      publicCommands.forEach((commandName) => {
        const agentSkillPath = router.getCommandPath(commandName, 'codex');
        const relativeSkillPath = path.relative(
          path.join(workspacePath, '.agents', 'skills'),
          agentSkillPath
        );
        const systemSkillPath = path.join(workspacePath, '.system', 'skills', relativeSkillPath);

        expect(fs.existsSync(agentSkillPath)).toBe(true);
        expect(fs.existsSync(systemSkillPath)).toBe(true);
        expect(fs.readFileSync(systemSkillPath, 'utf8')).toBe(
          fs.readFileSync(agentSkillPath, 'utf8')
        );
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
