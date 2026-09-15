import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AutonomousOrchestrator } from '../../../src/orchestrator/AutonomousOrchestrator_new';
import { SpecLoader } from '../../../src/orchestrator/SpecLoader';

describe('Integration: Task Execution Flow', () => {
  let workspaceDir: string;
  let specifyDir: string;
  let specsDir: string;
  const specId = '001-task-flow';

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-task-flow-'));
    specifyDir = path.join(workspaceDir, '.specify');
    specsDir = path.join(specifyDir, 'specs');
    await fs.mkdir(path.join(specsDir, specId), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  async function writeSpec(tasksContent: string): Promise<void> {
    const specDir = path.join(specsDir, specId);
    const specContent = `---
id: ${specId}
title: Task Flow Spec
status: draft
created: 2026-04-04
updated: 2026-04-04
---

# Task Flow Spec

Verify task execution updates tasks.md as work completes.
`;

    await fs.writeFile(path.join(specDir, 'spec.md'), specContent, 'utf-8');
    await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent, 'utf-8');
  }

  it('loads real task IDs from tasks.md instead of synthetic sequential IDs', async () => {
    await writeSpec(`# Tasks

- [ ] T001 First task
- [ ] #T002 Second task
- [x] **T003**: Third task`);

    const loader = new SpecLoader(specsDir);
    const spec = await loader.loadSpec(specId);

    expect(spec.tasks.map((task) => task.id)).toEqual(['T001', 'T002', 'T003']);
    expect(spec.tasks.map((task) => task.status)).toEqual(['pending', 'pending', 'completed']);
  });

  it('leaves tasks unchecked and stops at the first help request from a .specify path', async () => {
    await writeSpec(`# Tasks

- [ ] T001 First task
- [ ] #T002 Second task`);

    const orchestrator = new AutonomousOrchestrator(specifyDir);
    await orchestrator.start();

    const updatedTasks = await fs.readFile(path.join(specsDir, specId, 'tasks.md'), 'utf-8');
    expect(updatedTasks).toContain('- [ ] T001 First task');
    expect(updatedTasks).toContain('- [ ] #T002 Second task');
    expect(updatedTasks).not.toContain('[x]');

    const ipcStatus = JSON.parse(
      await fs.readFile(path.join(specifyDir, 'ipc', 'status.json'), 'utf-8')
    ) as { state?: string; last_output?: string };
    expect(ipcStatus.state).toBe('awaiting_input');
    expect(ipcStatus.last_output).toContain('Task T001');
    expect(ipcStatus.last_output).toContain(`spec ${specId}`);
  });

  it('preserves completed tasks and leaves remaining work unchecked from a specs path', async () => {
    await writeSpec(`# Tasks

- [x] #T001 Already done
- [ ] T002 Remaining work`);

    const orchestrator = new AutonomousOrchestrator(specsDir);
    await orchestrator.start();

    const updatedTasks = await fs.readFile(path.join(specsDir, specId, 'tasks.md'), 'utf-8');
    expect(updatedTasks).toContain('- [x] #T001 Already done');
    expect(updatedTasks).toContain('- [ ] T002 Remaining work');
  });

  it('does not advance another feature with the same task ID on repeated starts', async () => {
    await writeSpec('- [ ] T001 First feature work');
    const secondSpecId = '002-task-flow';
    const secondDir = path.join(specsDir, secondSpecId);
    await fs.mkdir(secondDir);
    await fs.writeFile(
      path.join(secondDir, 'spec.md'),
      `---\nid: ${secondSpecId}\ntitle: Second feature\nstatus: draft\n---\n`
    );
    await fs.writeFile(path.join(secondDir, 'tasks.md'), '- [ ] T001 Second feature work');

    const orchestrator = new AutonomousOrchestrator(workspaceDir);
    await orchestrator.start();
    const firstStatus = await fs.readFile(path.join(specifyDir, 'ipc', 'status.json'), 'utf-8');
    await orchestrator.start();
    const secondStatus = await fs.readFile(path.join(specifyDir, 'ipc', 'status.json'), 'utf-8');

    expect(JSON.parse(firstStatus).last_output).toContain(`spec ${specId}`);
    expect(JSON.parse(secondStatus).last_output).toBe(JSON.parse(firstStatus).last_output);
    expect(await fs.readFile(path.join(specsDir, specId, 'tasks.md'), 'utf-8')).toBe(
      '- [ ] T001 First feature work'
    );
    expect(await fs.readFile(path.join(secondDir, 'tasks.md'), 'utf-8')).toBe(
      '- [ ] T001 Second feature work'
    );
  });

  it('exits the real root entrypoint with help pending and no completion claim', async () => {
    const tasks = '- [ ] T001 First task\n- [ ] T002 Unrelated task';
    await writeSpec(tasks);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../../../src/index.ts', import.meta.url)),
      ],
      {
        cwd: workspaceDir,
        env: { ...process.env, SPEC_DIR: specsDir, WORKSPACE_DIR: workspaceDir },
        timeout: 5000,
      }
    );

    expect(stdout).not.toContain('task_completed');
    expect(await fs.readFile(path.join(specsDir, specId, 'tasks.md'), 'utf-8')).toBe(tasks);
    const ipc = JSON.parse(await fs.readFile(path.join(specifyDir, 'ipc', 'status.json'), 'utf-8'));
    expect(ipc.state).toBe('awaiting_input');
    expect(ipc.last_output).toContain(`Task T001 from spec ${specId}`);
  });
});
