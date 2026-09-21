import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../../src/types/index.js';
import { AutonomousOrchestrator } from '../../../src/orchestrator/AutonomousOrchestrator_new.js';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  mkdir: vi.fn(),
  write: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../../src/orchestrator/SpecLoader.js', () => ({
  SpecLoader: class {
    loadAllSpecs = mocks.load;
    updateTaskStatus = mocks.update;
  },
}));
vi.mock('fs/promises', () => ({ mkdir: mocks.mkdir, writeFile: mocks.write }));
vi.mock('../../../src/utils/Logger.js', () => ({
  logger: { info: mocks.info, warn: vi.fn() },
}));

function task(id = 'T001', dependencies: string[] = []): Task {
  return { id, specId: '001', description: id, status: 'pending', dependencies, attemptCount: 0 };
}

describe('Root completion safety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.load.mockResolvedValue([]);
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.write.mockResolvedValue(undefined);
  });

  it('requests help once without claiming execution, completion, or advancing other tasks', async () => {
    const tasks = [task(), task('T002', ['T001']), task('T003')];
    const before = structuredClone(tasks);
    mocks.load.mockResolvedValue([{ tasks }]);
    const root = new AutonomousOrchestrator('/workspace');
    const execute = vi.spyOn(root, 'executeTask');

    await root.start();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(tasks[0]);
    expect(tasks).toEqual(before);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.write.mock.calls[0][1])).toMatchObject({
      state: 'awaiting_input',
      pending_input: '',
      last_output: 'Please help me implement Task T001 from spec 001',
    });
    expect(mocks.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'task_completed' })
    );
    expect(mocks.info).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'task_started' }));
  });

  it('does not accept a direct help request as execution evidence', async () => {
    const current = task();
    await new AutonomousOrchestrator('/workspace').executeTask(current);
    expect(current.status).toBe('pending');
    expect(current.startedAt).toBeUndefined();
    expect(current.completedAt).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not downgrade an already completed task passed directly', async () => {
    const current = { ...task(), status: 'completed' as const, completedAt: '2026-09-15' };
    await new AutonomousOrchestrator('/workspace').executeTask(current);
    expect(current.completedAt).toBe('2026-09-15');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('leaves work untouched if publishing the help request fails and permits a later start', async () => {
    const current = task();
    mocks.load.mockResolvedValue([{ tasks: [current] }]);
    mocks.write.mockRejectedValueOnce(new Error('IPC unavailable'));
    const root = new AutonomousOrchestrator('/workspace');
    await expect(root.start()).rejects.toThrow('IPC unavailable');
    expect(current).toEqual(task());
    expect(mocks.update).not.toHaveBeenCalled();
    await root.start();
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });

  it('discards loaded tasks after stop and prevents an overlapping restart', async () => {
    let finishLoad!: (specs: { tasks: Task[] }[]) => void;
    let loaded!: () => void;
    const loading = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    mocks.load.mockImplementationOnce(() => {
      loaded();
      return new Promise((resolve) => {
        finishLoad = resolve;
      });
    });
    const root = new AutonomousOrchestrator('/workspace');
    const running = root.start();
    await loading;
    root.stop();
    await root.start();
    finishLoad([{ tasks: [task()] }]);
    await running;
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.load.mockResolvedValue([{ tasks: [task('T002')] }]);
    await root.start();
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.write.mock.calls[0][1]).last_output).toContain('Task T002');
  });

  it('ignores a concurrent start while a run is active', async () => {
    mocks.load.mockResolvedValue([{ tasks: [task()] }]);
    const root = new AutonomousOrchestrator('/workspace');
    const running = root.start();
    await root.start();
    await running;
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });

  it('does not complete or advance work when an in-flight help write finishes after stop', async () => {
    const tasks = [task(), task('T002')];
    let finishWrite!: () => void;
    let writing!: () => void;
    const startedWrite = new Promise<void>((resolve) => {
      writing = resolve;
    });
    mocks.load.mockResolvedValue([{ tasks }]);
    mocks.write.mockImplementationOnce(() => {
      writing();
      return new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    });
    const root = new AutonomousOrchestrator('/workspace');
    const running = root.start();
    await startedWrite;
    root.stop();
    await root.start();
    finishWrite();
    await running;
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(tasks).toEqual([task(), task('T002')]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns without polling when no task is ready', async () => {
    mocks.load.mockResolvedValue([{ tasks: [task('T002', ['T001'])] }]);
    await new AutonomousOrchestrator('/workspace').start();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
