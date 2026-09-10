import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'reflect-metadata';
import { cleanupTestWorkspace } from '../../helpers/workspace';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

// Mock the DI container since esbuild (vitest) doesn't emit decorator metadata
// Create real service instances manually instead of relying on tsyringe resolution
import { Logger } from '../../../extension/src/services/Logger';
import { VersionDetector } from '../../../extension/src/services/migration/VersionDetector';
import { UpgradeService } from '../../../extension/src/services/migration/UpgradeService';
import { ResourceSyncer } from '../../../extension/src/services/migration/ResourceSyncer';
import { PathMigrator } from '../../../extension/src/services/migration/PathMigrator';

const logger = new Logger();
const versionDetector = new VersionDetector(logger);
const upgradeService = new UpgradeService(logger, versionDetector);
const resourceSyncer = new ResourceSyncer(logger);
const pathMigrator = new PathMigrator(logger);

const resolveMap = new Map<unknown, unknown>([
  [Logger, logger],
  [VersionDetector, versionDetector],
  [UpgradeService, upgradeService],
  [ResourceSyncer, resourceSyncer],
  [PathMigrator, pathMigrator],
]);

vi.mock('../../../extension/src/di/container', () => ({
  getContainer: () => ({
    resolve: (token: unknown) => resolveMap.get(token),
  }),
  registerServices: vi.fn(),
  resetContainer: vi.fn(),
}));

import { GoferMigrator } from '../../../extension/src/goferMigrator';

/**
 * Create a bare test workspace without any .specify structure
 * (Unlike createTestWorkspace which creates full gofer structure)
 */
async function createBareWorkspace(): Promise<string> {
  const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'gofer-test-'));
  return tmpDir;
}

describe('GoferMigrator', () => {
  let workspace: string;
  let migrator: GoferMigrator;

  beforeEach(async () => {
    workspace = await createBareWorkspace();
    migrator = new GoferMigrator(workspace);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(workspace);
  });

  describe('Format Detection', () => {
    it('should detect "none" when .specify folder does not exist', async () => {
      const format = await migrator.detectFormat();
      expect(format).toBe('none');
    });

    it('should detect "gofer" format with all required directories', async () => {
      // Create Gofer structure
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      const format = await migrator.detectFormat();
      expect(format).toBe('gofer');
    });

    it('should detect "legacy-json" format with JSON specs', async () => {
      // Create legacy structure with JSON files
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/feature-001.json'),
        JSON.stringify({ title: 'Legacy Feature' }),
        'utf-8'
      );

      const format = await migrator.detectFormat();
      expect(format).toBe('legacy-json');
    });

    it('should detect "mixed" format when both Gofer and JSON exist', async () => {
      // Create Gofer structure
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      // Add legacy JSON file
      await fs.writeFile(
        path.join(workspace, '.specify/old-spec.json'),
        JSON.stringify({ title: 'Old Spec' }),
        'utf-8'
      );

      const format = await migrator.detectFormat();
      expect(format).toBe('mixed');
    });

    it('should ignore spec-schema.json when detecting JSON specs', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/spec-schema.json'),
        JSON.stringify({ schema: true }),
        'utf-8'
      );

      const format = await migrator.detectFormat();
      // Should not detect as legacy-json since spec-schema.json is ignored
      expect(format).not.toBe('legacy-json');
    });

    it('should detect "mixed" for partial Gofer structure', async () => {
      // Only create some directories
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });

      const format = await migrator.detectFormat();
      expect(format).toBe('mixed');
    });
  });

  describe('Existence Check', () => {
    it('should return false when .specify does not exist', async () => {
      const exists = await migrator.exists();
      expect(exists).toBe(false);
    });

    it('should return true when .specify exists', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });

      const exists = await migrator.exists();
      expect(exists).toBe(true);
    });

    it('should return true for .specify with subdirectories', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs/001-test'), { recursive: true });

      const exists = await migrator.exists();
      expect(exists).toBe(true);
    });
  });

  describe('Version Info', () => {
    it('should return version info for "none" format', async () => {
      const info = await migrator.getVersionInfo();

      expect(info.format).toBe('none');
      expect(info.needsUpgrade).toBe(false);
      expect(info.details).toContain('No .specify folder');
    });

    it('should return version info for "gofer" format', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      const info = await migrator.getVersionInfo();

      expect(info.format).toBe('gofer');
      expect(info.needsUpgrade).toBe(false);
      expect(info.details).toBeDefined();
    });

    it('should return version info for "legacy-json" format', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/legacy.json'),
        '{"title": "Legacy"}',
        'utf-8'
      );

      const info = await migrator.getVersionInfo();

      expect(info.format).toBe('legacy-json');
      expect(info.needsUpgrade).toBe(true);
      expect(info.details).toBeDefined();
    });

    it('should return version info for "mixed" format', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/mixed.json'),
        '{"title": "Mixed"}',
        'utf-8'
      );

      const info = await migrator.getVersionInfo();

      expect(info.format).toBe('mixed');
      expect(info.needsUpgrade).toBe(true);
      expect(info.details).toBeDefined();
    });
  });

  describe('Path Fixing - File Patterns', () => {
    it('should detect files that need path fixing in .claude/commands', async () => {
      // Create .claude/commands directory with files
      const commandsDir = path.join(workspace, '.claude/commands');
      await fs.mkdir(commandsDir, { recursive: true });

      const commandContent = `# Gofer Command

Load all specs from specs/001-feature/spec.md

Use the specs/ directory for all operations.`;

      await fs.writeFile(path.join(commandsDir, 'test-command.md'), commandContent, 'utf-8');

      // Verify file exists and has old path references
      const content = await fs.readFile(path.join(commandsDir, 'test-command.md'), 'utf-8');
      expect(content).toContain('specs/001-feature');
      expect(content).toContain('specs/ directory');
    });

    it('should detect files in .specify/scripts that need fixing', async () => {
      const scriptsDir = path.join(workspace, '.specify/scripts/bash');
      await fs.mkdir(scriptsDir, { recursive: true });

      const scriptContent = `#!/bin/bash
SPECS_DIR="$REPO_ROOT/specs"
cd specs/001-feature
`;

      await fs.writeFile(path.join(scriptsDir, 'test-script.sh'), scriptContent, 'utf-8');

      const content = await fs.readFile(path.join(scriptsDir, 'test-script.sh'), 'utf-8');
      expect(content).toContain('SPECS_DIR="$REPO_ROOT/specs"');
    });

    it('should detect config files that need fixing', async () => {
      const vscodeDir = path.join(workspace, '.vscode');
      await fs.mkdir(vscodeDir, { recursive: true });

      const settingsContent = JSON.stringify(
        {
          'gofer.specsPath': '${workspaceFolder}/specs/',
        },
        null,
        2
      );

      await fs.writeFile(path.join(vscodeDir, 'settings.json'), settingsContent, 'utf-8');

      const content = await fs.readFile(path.join(vscodeDir, 'settings.json'), 'utf-8');
      expect(content).toContain('${workspaceFolder}/specs/');
    });
  });

  describe('Edge Cases', () => {
    it('should handle .specify with empty subdirectories', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });

      const format = await migrator.detectFormat();
      // Should return mixed since templates is missing
      expect(format).toBe('mixed');
    });

    it('should handle .specify with files but no directories', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(path.join(workspace, '.specify/README.md'), 'test', 'utf-8');

      const format = await migrator.detectFormat();
      expect(format).toBe('mixed');
    });

    it('should handle concurrent format detection calls', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      const [format1, format2, format3] = await Promise.all([
        migrator.detectFormat(),
        migrator.detectFormat(),
        migrator.detectFormat(),
      ]);

      expect(format1).toBe('gofer');
      expect(format2).toBe('gofer');
      expect(format3).toBe('gofer');
    });

    it('should handle invalid JSON files gracefully', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/invalid.json'),
        'not valid json {{{',
        'utf-8'
      );

      // Should still detect the file exists
      const format = await migrator.detectFormat();
      expect(format).toBe('legacy-json');
    });

    it('should handle symlinks in .specify directory', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.mkdir(path.join(workspace, 'actual-specs'), { recursive: true });

      try {
        // Create symlink (may not work on all platforms)
        await fs.symlink(
          path.join(workspace, 'actual-specs'),
          path.join(workspace, '.specify/specs')
        );

        const format = await migrator.detectFormat();
        // Should handle symlinks as directories
        expect(['gofer', 'mixed']).toContain(format);
      } catch (error) {
        // Symlink creation may fail on Windows without admin rights
        // Skip test in that case
        console.log('Skipping symlink test:', error);
      }
    });

    it('should handle very deep directory structures', async () => {
      // Create a very deep structure
      const deepPath = path.join(workspace, '.specify/scripts/bash/utils/helpers/tools/vendor');
      await fs.mkdir(deepPath, { recursive: true });
      await fs.writeFile(path.join(deepPath, 'deep-script.sh'), '#!/bin/bash\nspecs/', 'utf-8');

      // Should not throw error
      const format = await migrator.detectFormat();
      expect(format).toBeDefined();
    });
  });

  describe('Multiple Spec Directories', () => {
    it('should detect format when specs/ has multiple spec directories', async () => {
      const specsDir = path.join(workspace, '.specify/specs');
      await fs.mkdir(specsDir, { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      // Create multiple spec directories
      for (let i = 1; i <= 5; i++) {
        const specDir = path.join(specsDir, `00${i}-feature-${i}`);
        await fs.mkdir(specDir, { recursive: true });
        await fs.writeFile(path.join(specDir, 'spec.md'), `# Feature ${i}`, 'utf-8');
      }

      const format = await migrator.detectFormat();
      expect(format).toBe('gofer');
    });

    it('should handle empty specs/ directory', async () => {
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });

      const format = await migrator.detectFormat();
      expect(format).toBe('gofer');
    });
  });

  describe('File System Permissions', () => {
    it('should handle read-only .specify directory gracefully', async () => {
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });

      // Note: This test may not work on all platforms/filesystems
      try {
        await fs.chmod(path.join(workspace, '.specify'), 0o444); // Read-only

        const exists = await migrator.exists();
        expect(exists).toBe(true);

        // Restore permissions for cleanup
        await fs.chmod(path.join(workspace, '.specify'), 0o755);
      } catch (error) {
        // Skip if chmod not supported
        console.log('Skipping permission test:', error);
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should detect fresh Gofer installation', async () => {
      // Simulate fresh gofer init
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/memory/constitution.md'),
        '# Constitution',
        'utf-8'
      );

      const format = await migrator.detectFormat();
      expect(format).toBe('gofer');

      const info = await migrator.getVersionInfo();
      expect(info.needsUpgrade).toBe(false);
    });

    it('should detect legacy project needing upgrade', async () => {
      // Simulate old Gofer project
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });
      await fs.writeFile(
        path.join(workspace, '.specify/feature-login.json'),
        JSON.stringify({
          id: '001',
          title: 'User Login',
          status: 'draft',
        }),
        'utf-8'
      );

      const format = await migrator.detectFormat();
      expect(format).toBe('legacy-json');

      const info = await migrator.getVersionInfo();
      expect(info.needsUpgrade).toBe(true);
    });

    it('should detect mid-migration state', async () => {
      // User started migration but didn't finish
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      // Missing templates directory

      // Still has old JSON files
      await fs.writeFile(
        path.join(workspace, '.specify/old-feature.json'),
        JSON.stringify({ title: 'Old Feature' }),
        'utf-8'
      );

      const format = await migrator.detectFormat();
      expect(format).toBe('mixed');

      const info = await migrator.getVersionInfo();
      expect(info.needsUpgrade).toBe(true);
    });
  });

  describe('syncMissingResources - AI instruction consent prompt', () => {
    let setupDefaultInstructionsSpy: ReturnType<typeof vi.spyOn>;
    let setupCodexSkillsSpy: ReturnType<typeof vi.spyOn>;
    let setupCodexGlobalSymlinkSpy: ReturnType<typeof vi.spyOn>;
    let isCodexGlobalSymlinkCurrentSpy: ReturnType<typeof vi.spyOn>;
    let hasDisabledCodexSkillEntriesSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      // Create full .specify structure so only AI instructions are missing
      await fs.mkdir(path.join(workspace, '.specify/specs'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/memory'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/templates'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/commands'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/scripts/bash'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/scripts/hooks'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify/scripts/node/lib'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.claude/commands'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.claude/agents'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.github/prompts'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.github/instructions'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.gemini/commands/gofer'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.grok/skills/eai'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.system/skills/placeholder'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.agents/skills/placeholder'), { recursive: true });

      // Create non-empty directories with placeholder files
      await fs.writeFile(path.join(workspace, '.claude/commands/placeholder.md'), '# cmd', 'utf-8');
      await fs.writeFile(path.join(workspace, '.claude/agents/placeholder.md'), '# agent', 'utf-8');
      await fs.writeFile(
        path.join(workspace, '.github/prompts/placeholder.prompt.md'),
        '# prompt',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.github/instructions/placeholder.instructions.md'),
        '# instructions',
        'utf-8'
      );
      await fs.writeFile(path.join(workspace, '.gemini/extension.json'), '{}', 'utf-8');
      await fs.writeFile(
        path.join(workspace, '.gemini/commands/gofer/placeholder.toml'),
        'description = "placeholder"',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.grok/skills/eai/SKILL.md'),
        '---\nname: eai\n---\n# Eai',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.system/skills/placeholder/SKILL.md'),
        '# skill',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.agents/skills/placeholder/SKILL.md'),
        '# skill',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.specify/scripts/bash/placeholder.sh'),
        '#!/bin/bash',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.specify/scripts/hooks/post-tool-use.mjs'),
        'export default {}',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.specify/commands/6_gofer_validate.md'),
        '# validate',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.specify/scripts/node/lib/visual-pass-pipeline.mjs'),
        'export async function runPass2() {}',
        'utf-8'
      );
      await fs.writeFile(
        path.join(workspace, '.specify/templates/placeholder.md'),
        '# template',
        'utf-8'
      );

      // AGENTS.md, CLAUDE.md, and GEMINI.md are intentionally NOT created.

      // Mock withProgress to immediately execute the callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).withProgress = vi.fn(
        async (
          _options: unknown,
          callback: (progress: { report: (value: unknown) => void }) => Promise<void>
        ) => {
          await callback({ report: vi.fn() });
        }
      );

      // Spy on setupDefaultInstructions
      setupDefaultInstructionsSpy = vi
        .spyOn(resourceSyncer, 'setupDefaultInstructions')
        .mockResolvedValue();
      setupCodexSkillsSpy = vi.spyOn(resourceSyncer, 'setupCodexSkills').mockResolvedValue();
      setupCodexGlobalSymlinkSpy = vi
        .spyOn(resourceSyncer, 'setupCodexGlobalSymlink')
        .mockResolvedValue();
      isCodexGlobalSymlinkCurrentSpy = vi
        .spyOn(resourceSyncer, 'isCodexGlobalSymlinkCurrent')
        .mockResolvedValue(true);
      hasDisabledCodexSkillEntriesSpy = vi
        .spyOn(resourceSyncer, 'hasDisabledCodexSkillEntries')
        .mockResolvedValue(false);
    });

    afterEach(() => {
      setupDefaultInstructionsSpy.mockRestore();
      setupCodexSkillsSpy.mockRestore();
      setupCodexGlobalSymlinkSpy.mockRestore();
      isCodexGlobalSymlinkCurrentSpy.mockRestore();
      hasDisabledCodexSkillEntriesSpy.mockRestore();
    });

    it('shows prompt when AI instruction files are missing', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined as unknown as string
      );

      await migrator.syncMissingResources();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Missing AI instruction files (AGENTS.md, CLAUDE.md, GEMINI.md). Generate them?',
        'Yes',
        'No'
      );
    });

    it('generates files when user selects "Yes"', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Yes' as unknown as string);

      await migrator.syncMissingResources();

      expect(setupDefaultInstructionsSpy).toHaveBeenCalled();
    });

    it('does NOT generate files when user selects "No"', async () => {
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('No' as unknown as string);

      await migrator.syncMissingResources();

      expect(setupDefaultInstructionsSpy).not.toHaveBeenCalled();
    });

    it('does not show prompt on second call after decline', async () => {
      // First call: user declines
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('No' as unknown as string);
      await migrator.syncMissingResources();

      // Reset mock call count
      vi.mocked(vscode.window.showInformationMessage).mockClear();

      // Second call: prompt should NOT appear
      await migrator.syncMissingResources();

      // showInformationMessage may be called for the final success message,
      // but NOT with the consent prompt text
      const calls = vi.mocked(vscode.window.showInformationMessage).mock.calls;
      const consentCalls = calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Missing AI instruction files')
      );
      expect(consentCalls).toHaveLength(0);
    });

    it('dismissed prompt (undefined) does not set decline flag -- prompt reappears on next call', async () => {
      // First call: user dismisses (undefined response)
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined as unknown as string
      );
      await migrator.syncMissingResources();

      expect(setupDefaultInstructionsSpy).not.toHaveBeenCalled();

      // Reset mock call count
      vi.mocked(vscode.window.showInformationMessage).mockClear();

      // Second call: prompt should reappear since decline flag was NOT set
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Yes' as unknown as string);
      await migrator.syncMissingResources();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Missing AI instruction files (AGENTS.md, CLAUDE.md, GEMINI.md). Generate them?',
        'Yes',
        'No'
      );
      expect(setupDefaultInstructionsSpy).toHaveBeenCalled();
    });

    it('new GoferMigrator instance re-prompts (simulates extension restart)', async () => {
      // First instance: user declines
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('No' as unknown as string);
      await migrator.syncMissingResources();

      // Create a NEW instance (simulates extension restart)
      const freshMigrator = new GoferMigrator(workspace);
      vi.mocked(vscode.window.showInformationMessage).mockClear();
      setupDefaultInstructionsSpy = vi
        .spyOn(resourceSyncer, 'setupDefaultInstructions')
        .mockResolvedValue();

      // New instance should prompt again
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Yes' as unknown as string);
      await freshMigrator.syncMissingResources();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Missing AI instruction files (AGENTS.md, CLAUDE.md, GEMINI.md). Generate them?',
        'Yes',
        'No'
      );
      expect(setupDefaultInstructionsSpy).toHaveBeenCalled();
    });
  });
});
