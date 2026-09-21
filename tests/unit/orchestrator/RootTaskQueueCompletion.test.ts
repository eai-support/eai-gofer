import { describe, expect, it, vi } from 'vitest';
import { TaskQueue } from '../../../src/orchestrator/TaskQueue.js';
import type { Task } from '../../../src/types/index.js';

vi.mock('../../../src/utils/Logger.js', () => ({ logger: { warn: vi.fn() } }));

function task(
  specId: string,
  id = 'T001',
  dependencies: string[] = [],
  status: Task['status'] = 'pending'
): Task {
  return { specId, id, dependencies, status, description: id, attemptCount: 0 };
}

describe('Root task queue completion isolation', () => {
  it('retains matching task IDs in separate specs with local dependency ordering', async () => {
    const tasks = [
      task('001', 'T002', ['T001']),
      task('002', 'T002', ['T001']),
      task('001'),
      task('002'),
    ];
    const queue = new TaskQueue();
    const sorted = await queue.buildQueue(tasks);
    expect(sorted.map((t) => [t.specId, t.id])).toEqual([
      ['001', 'T001'],
      ['001', 'T002'],
      ['002', 'T001'],
      ['002', 'T002'],
    ]);
    expect(tasks[0].dependencies).toEqual(['T001']);
    expect(tasks[1].dependencies).toEqual(['T001']);
  });

  it('does not use another spec completion to unlock local work', async () => {
    const queue = new TaskQueue();
    const blocked = task('002', 'T002', ['T001']);
    await queue.buildQueue([
      task('001', 'T001', [], 'completed'),
      task('002', 'T001', [], 'failed'),
      blocked,
    ]);
    expect(queue.getNextTask()).toBeNull();
  });

  it('does not resolve a missing local dependency from another spec', async () => {
    const queue = new TaskQueue();
    await queue.buildQueue([task('001', 'T001', [], 'completed'), task('002', 'T002', ['T001'])]);
    expect(queue.getNextTask()).toBeNull();
  });

  it('unlocks work only after its own dependency completes', async () => {
    const queue = new TaskQueue();
    const local = task('002', 'T001', [], 'in_progress');
    const next = task('002', 'T002', ['T001']);
    await queue.buildQueue([task('001', 'T001', [], 'failed'), local, next]);
    expect(queue.getNextTask()).toBeNull();
    local.status = 'completed';
    expect(queue.getNextTask()).toBe(next);
  });

  it('does not invent a cross-spec cycle from local IDs', async () => {
    const queue = new TaskQueue();
    await expect(
      queue.buildQueue([
        task('001', 'T001', ['T002']),
        task('001', 'T002'),
        task('002', 'T001'),
        task('002', 'T002', ['T001']),
      ])
    ).resolves.toHaveLength(4);
  });

  it('still detects a local cycle when another spec has the same IDs', async () => {
    const queue = new TaskQueue();
    await expect(
      queue.buildQueue([
        task('001', 'T001', ['T002']),
        task('001', 'T002', ['T001']),
        task('002', 'T001'),
        task('002', 'T002'),
      ])
    ).rejects.toThrow(/circular/i);
  });
});
