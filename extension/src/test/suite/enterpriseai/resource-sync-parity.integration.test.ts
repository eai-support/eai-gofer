import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ResourceSyncer } from '../../../services/migration/ResourceSyncer';
import { Logger } from '../../../services/Logger';

const TEST_COMMAND_CONTENT = `---
description: Start or continue the EAI Gofer delivery pipeline.
gofer:
  canonicalSource: .specify/commands/0_gofer_start.md
---

# Eai

Use this as the single user-facing Gofer command. Route internally through .specify/commands.
`;

suite('enterpriseai resource sync parity (extension integration)', () => {
  const fixtureWorkspace = path.join(process.cwd(), '.resource-sync-parity-fixture');
  const customAgentSkillPath = path.join(
    fixtureWorkspace,
    '.agents',
    'skills',
    'custom',
    'SKILL.md'
  );

  setup(async () => {
    await fs.rm(fixtureWorkspace, { recursive: true, force: true });
    await fs.mkdir(path.join(fixtureWorkspace, '.claude', 'commands'), { recursive: true });
    await fs.mkdir(path.dirname(customAgentSkillPath), { recursive: true });

    await fs.writeFile(
      path.join(fixtureWorkspace, '.claude', 'commands', 'eai.md'),
      TEST_COMMAND_CONTENT,
      'utf8'
    );
    await fs.writeFile(customAgentSkillPath, '# Custom Skill\n\nDo not overwrite.', 'utf8');
  });

  teardown(async () => {
    await fs.rm(fixtureWorkspace, { recursive: true, force: true });
  });

  test('syncs bundled shared skills with exact parity while preserving local commands and custom skills', async () => {
    const extension = vscode.extensions.getExtension('EnterpriseAI.gofer');
    assert.ok(extension, 'The Gofer extension must be available to resolve its release bundle');
    const syncer = new ResourceSyncer(new Logger());
    syncer.setWorkspacePath(fixtureWorkspace);

    await syncer.setupCodexSkills();

    for (const entrypoint of ['eai', 'eai-update']) {
      const bundledContent: string = await fs.readFile(
        path.join(extension.extensionPath, 'resources', 'agents-skills', entrypoint, 'SKILL.md'),
        'utf8'
      );
      assert.ok(bundledContent.includes('Host: Codex / Antigravity CLI / Antigravity desktop'));
      assert.ok(bundledContent.includes('--host <host>'));
      for (const root of ['.system', '.agents']) {
        const syncedContent = await fs.readFile(
          path.join(fixtureWorkspace, root, 'skills', entrypoint, 'SKILL.md'),
          'utf8'
        );
        assert.strictEqual(syncedContent, bundledContent, `${root}/${entrypoint} bundle parity`);
      }
    }

    const mirroredAgentContent = await fs.readFile(
      path.join(fixtureWorkspace, '.agents', 'skills', 'eai', 'SKILL.md'),
      'utf8'
    );
    const preservedCustomSkill = await fs.readFile(customAgentSkillPath, 'utf8');

    assert.ok(
      mirroredAgentContent.includes(
        'Treat `.specify/commands/*.md` as internal stage contracts, not user-facing commands.'
      )
    );
    assert.ok(
      mirroredAgentContent.includes(
        'Keep all Gofer functions available by routing internally to the right stage contract.'
      )
    );
    assert.strictEqual(
      await fs.readFile(path.join(fixtureWorkspace, '.claude', 'commands', 'eai.md'), 'utf8'),
      TEST_COMMAND_CONTENT
    );
    assert.strictEqual(preservedCustomSkill, '# Custom Skill\n\nDo not overwrite.');
  });
});
