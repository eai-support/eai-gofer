import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cleanupModuleUrl = new URL(
  '../../../.specify/scripts/node/gofer-local-settings-cleanup.mjs',
  import.meta.url
);

describe('gofer local settings cleanup', () => {
  it('archives stale Gofer surfaces without removing the public eai entrypoint', async () => {
    const { cleanupLocalSettings } = await import(cleanupModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-local-cleanup-home-'));
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-local-cleanup-workspace-'));

    try {
      const staleClaude = path.join(home, '.claude', 'commands', '0_gofer_start.md');
      const currentClaude = path.join(home, '.claude', 'commands', 'eai.md');
      const staleWorkspaceSkill = path.join(workspace, '.agents', 'skills', 'gofer', 'SKILL.md');
      const staleWorkspaceSkillDir = path.dirname(staleWorkspaceSkill);
      const staleBundleCommand = path.join(home, 'plugins', 'eai-gofer', 'commands', 'gofer.md');
      const nonGoferFile = path.join(home, '.claude', 'commands', 'gofer_plan.md');

      fs.mkdirSync(path.dirname(staleClaude), { recursive: true });
      fs.mkdirSync(path.dirname(currentClaude), { recursive: true });
      fs.mkdirSync(path.dirname(staleWorkspaceSkill), { recursive: true });
      fs.mkdirSync(path.dirname(staleBundleCommand), { recursive: true });
      fs.writeFileSync(staleClaude, '# Gofer old command\n\n.specify/commands/0_gofer_start.md\n');
      fs.writeFileSync(currentClaude, '# Eai\n\nCurrent public entrypoint.\n');
      fs.writeFileSync(staleWorkspaceSkill, '# Gofer\n\ngofer-workspace-check\n');
      fs.writeFileSync(staleBundleCommand, '# Gofer\n\neai-gofer stale command\n');
      fs.writeFileSync(nonGoferFile, '# User file\n\nNot managed by this project.\n');

      const report = await cleanupLocalSettings({
        home,
        workspaces: [workspace],
        apply: true,
        now: new Date('2026-08-25T00:00:00.000Z'),
      });

      expect(report.status).toBe('applied');
      expect(report.removed.map((item: { path: string }) => item.path).sort()).toEqual(
        [staleClaude, staleBundleCommand, staleWorkspaceSkillDir].sort()
      );
      expect(fs.existsSync(staleClaude)).toBe(false);
      expect(fs.existsSync(staleWorkspaceSkillDir)).toBe(false);
      expect(fs.existsSync(staleBundleCommand)).toBe(false);
      expect(fs.existsSync(currentClaude)).toBe(true);
      expect(fs.existsSync(nonGoferFile)).toBe(true);
      for (const item of report.removed as Array<{ archivePath: string }>) {
        expect(fs.existsSync(item.archivePath)).toBe(true);
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
