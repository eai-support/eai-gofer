import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
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

  test('syncs generated Codex skills to .agents non-destructively with parity', async () => {
    const syncer = new ResourceSyncer(new Logger());
    syncer.setWorkspacePath(fixtureWorkspace);

    await syncer.setupCodexSkills();

    const codexSkillPath = path.join(fixtureWorkspace, '.system', 'skills', 'eai', 'SKILL.md');
    const mirroredAgentPath = path.join(fixtureWorkspace, '.agents', 'skills', 'eai', 'SKILL.md');

    const codexSkillContent = await fs.readFile(codexSkillPath, 'utf8');
    const mirroredAgentContent = await fs.readFile(mirroredAgentPath, 'utf8');
    const preservedCustomSkill = await fs.readFile(customAgentSkillPath, 'utf8');

    assert.strictEqual(mirroredAgentContent, codexSkillContent);
    assert.ok(codexSkillContent.includes('Route internally through .specify/commands.'));
    assert.strictEqual(preservedCustomSkill, '# Custom Skill\n\nDo not overwrite.');
  });
});
