/**
 * Autonomous Orchestrator
 * Tasks: T027, T028
 */

import { logger } from '../utils/Logger.js';
import { SpecLoader } from './SpecLoader.js';
import { TaskQueue } from './TaskQueue.js';
import type { Task } from '../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class AutonomousOrchestrator {
  private specLoader: SpecLoader;
  private taskQueue: TaskQueue;
  private isRunning = false;
  private runActive = false;
  private ipcPath: string;

  constructor(specsDir: string) {
    const normalizedSpecsDir = this.normalizeSpecsPath(specsDir);
    const specifyPath = path.dirname(normalizedSpecsDir);

    this.specLoader = new SpecLoader(normalizedSpecsDir);
    this.taskQueue = new TaskQueue();
    this.ipcPath = path.join(specifyPath, 'ipc', 'status.json');
  }

  async start(): Promise<void> {
    // A stopped run must finish its outstanding I/O before another run starts.
    if (this.runActive) {
      return;
    }
    this.runActive = true;
    this.isRunning = true;
    try {
      logger.info({ event: 'orchestrator_started', context: {} });
      await fs.mkdir(path.dirname(this.ipcPath), { recursive: true });
      if (!this.isRunning) {
        return;
      }

      const specs = await this.specLoader.loadAllSpecs();
      if (!this.isRunning) {
        return;
      }
      await this.taskQueue.buildQueue(specs.flatMap((s) => s.tasks));
      if (!this.isRunning) {
        return;
      }

      const task = this.taskQueue.getNextTask();
      if (task) {
        // The root only requests help. Do not poll or advance unrelated work.
        await this.executeTask(task);
      }
    } finally {
      this.isRunning = false;
      this.runActive = false;
      logger.info({ event: 'orchestrator_stopped', context: {} });
    }
  }

  stop(): void {
    this.isRunning = false;
  }

  async executeTask(task: Task): Promise<void> {
    if (task.status !== 'pending') {
      return;
    }

    // IPC delivery is not execution or verification evidence. Leave the task
    // unchanged until a trusted execution and required-check path exists.
    await this.signalNeedHelp(task);
    logger.info({
      event: 'task_awaiting_input',
      taskId: task.id,
      specId: task.specId,
      context: {},
    });
  }

  private async signalNeedHelp(task: Task): Promise<void> {
    const status = {
      timestamp: Date.now(),
      state: 'awaiting_input',
      last_output: `Please help me implement Task ${task.id} from spec ${task.specId}`,
      pending_input: '',
    };
    await fs.writeFile(this.ipcPath, JSON.stringify(status, null, 2));
  }

  private normalizeSpecsPath(specsDir: string): string {
    const normalizedInput = path.normalize(specsDir);
    const normalizedSpecsSuffix = `${path.sep}specs`;

    if (
      normalizedInput.endsWith(normalizedSpecsSuffix) ||
      normalizedInput === 'specs' ||
      normalizedInput.endsWith(`.specify${normalizedSpecsSuffix}`)
    ) {
      return normalizedInput;
    }

    if (
      normalizedInput.endsWith('.specify') ||
      normalizedInput.endsWith(`${path.sep}.specify`) ||
      path.basename(normalizedInput) === '.specify'
    ) {
      return path.join(normalizedInput, 'specs');
    }

    return path.join(normalizedInput, '.specify', 'specs');
  }
}
