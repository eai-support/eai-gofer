import * as assert from 'assert';
import * as vscode from 'vscode';
import { InstructionGenerator } from '../../services/InstructionGenerator';
import { ProjectInfo } from '../../services/ProjectDetector';

suite('Native Gofer instruction contract', () => {
  const project: ProjectInfo = {
    name: 'isolated-local-mvp',
    language: 'javascript',
    framework: null,
    testRunner: null,
    testCommand: null,
    buildCommand: null,
    lintCommand: null,
    formatCommand: null,
    packageManager: 'npm',
    hasTypeScript: false,
    hasEslint: false,
    hasPrettier: false,
    eaiInitialized: false,
  };

  test('loads the candidate extension and registers its public and maintenance commands', async () => {
    const extension = vscode.extensions.getExtension('EnterpriseAI.gofer');
    assert.ok(extension);
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'gofer.eai',
      'gofer.initialize',
      'gofer.installOptionalTools',
      'gofer.checkForUpdates',
      'gofer.updateNow',
    ]) {
      assert.ok(commands.includes(command), `Missing ${command}`);
    }
  });

  for (const method of ['generateAgentsMd', 'generateClaudeMd', 'generateCopilotMd'] as const) {
    test(`${method} loads the shipped complete contract in the native extension host`, async () => {
      const content = await new InstructionGenerator()[method](project);
      for (const file of [
        'spec.md',
        'plan.md',
        'tasks.md',
        'traceability.md',
        'validation-report.md',
      ]) {
        assert.ok(content.includes(file), `Missing ${file}`);
      }
      assert.ok(content.includes('before implementation continues'));
      assert.ok(content.includes('mark affected old evidence pending'));
      assert.ok(content.includes('A question alone does not authorize artifact edits'));
      assert.ok(content.includes('no implemented or required authentication needs no login'));
      assert.ok(content.includes('confirmed non-app work exempt'));
      assert.strictEqual(content.match(/<!-- gofer:always-on-eai:start -->/g)?.length, 1);
    });
  }
});
