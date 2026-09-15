/**
 * Task Queue with Dependency Resolution
 * Tasks: T025, T026
 */

import { logger } from '../utils/Logger.js';
import type { Task } from '../types/index.js';

export class TaskQueue {
  private queue: Task[] = [];

  async buildQueue(tasks: Task[]): Promise<Task[]> {
    if (tasks.length > 100) {
      logger.warn({
        event: 'scale_limit_exceeded',
        context: {
          limit: 100,
          actual: tasks.length,
          message: 'Task queue has >100 tasks',
        },
      });
    }

    this.queue = this.topologicalSort(tasks);
    return this.queue;
  }

  getNextTask(): Task | null {
    for (const task of this.queue) {
      if (task.status === 'pending' && this.areDependenciesSatisfied(task)) {
        return task;
      }
    }
    return null;
  }

  private topologicalSort(tasks: Task[]): Task[] {
    const taskMap = new Map(tasks.map((t) => [this.taskKey(t.specId, t.id), t]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: Task[] = [];

    const visit = (specId: string, taskId: string): void => {
      const key = this.taskKey(specId, taskId);
      if (visited.has(key)) {
        return;
      }
      if (visiting.has(key)) {
        throw new Error(`Circular dependency detected involving task ${taskId} in spec ${specId}`);
      }

      visiting.add(key);
      const task = taskMap.get(key);

      if (task) {
        for (const depId of task.dependencies) {
          visit(task.specId, depId);
        }
        visited.add(key);
        sorted.push(task);
      }

      visiting.delete(key);
    };

    for (const task of tasks) {
      visit(task.specId, task.id);
    }

    return sorted;
  }

  private areDependenciesSatisfied(task: Task): boolean {
    return task.dependencies.every((depId) => {
      const dep = this.queue.find((t) => t.specId === task.specId && t.id === depId);
      return dep?.status === 'completed';
    });
  }

  private taskKey(specId: string, taskId: string): string {
    return JSON.stringify([specId, taskId]);
  }
}
