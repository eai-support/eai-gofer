import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Task, TaskStatus } from '../types/index.js';

// Legacy type compatibility
interface Spec {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'in_progress' | 'testing' | 'completed' | 'failed';
  created: string;
  updated: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  featureBranch?: string;
  tasks: Task[];
  acceptanceCriteria: Array<{ id: string; description: string; status: string }>;
  qaRules: Array<{ pattern: string; answer: string; confidence: number }>;
}

interface SpecMetadata {
  title?: string;
  branch?: string;
  created?: string;
  status?: 'draft' | 'in_progress' | 'testing' | 'completed' | 'failed';
  input?: string;
  id?: string;
  [key: string]: string | undefined;
}

interface ParsedSpec {
  metadata: SpecMetadata;
  content: string;
}

export class SpecLoader {
  private specDir: string;

  constructor(specDir: string = '.specify/specs') {
    this.specDir = specDir;
  }

  async loadAllSpecs(): Promise<Spec[]> {
    try {
      // Check if it's the new Gofer format (.specify/specs/)
      if (this.specDir.endsWith('/specs') || this.specDir.endsWith('/specs/')) {
        return this.loadGoferSpecs();
      }

      // Fallback to legacy JSON format for backwards compatibility
      return this.loadLegacyJsonSpecs();
    } catch (error) {
      console.error('Error loading specs:', error);
      return [];
    }
  }

  /**
   * Load specs from Gofer format (.specify/specs/)
   */
  private async loadGoferSpecs(): Promise<Spec[]> {
    try {
      const entries = await fs.readdir(this.specDir, { withFileTypes: true });
      const specDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('_'));

      const specs = await Promise.all(
        specDirs.map(async (dir) => {
          try {
            return await this.loadGoferSpec(dir.name);
          } catch (error) {
            console.error(`Failed to load spec ${dir.name}:`, error);
            return null;
          }
        })
      );

      return specs.filter((s): s is Spec => s !== null);
    } catch (error) {
      console.error('Error loading Gofer specs:', error);
      return [];
    }
  }

  /**
   * Parse header metadata from official Gofer format
   */
  private parseSpecHeader(content: string): ParsedSpec {
    const lines = content.split('\n');
    const metadata: SpecMetadata = {};
    let contentStartIndex = 0;

    // Extract title from first line
    const titleMatch = lines[0]?.match(/^#\s*(?:Feature Specification:\s*)?(.+)$/);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
      contentStartIndex = 1;
    }

    // Parse metadata lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        contentStartIndex = i + 1;
        continue;
      }

      // Stop parsing metadata when we hit a markdown header
      if (line.startsWith('#')) {
        contentStartIndex = i;
        break;
      }

      // Parse metadata fields
      const featureBranchMatch = line.match(/^Feature Branch:\s*`?([^`]+)`?$/);
      if (featureBranchMatch) {
        metadata.branch = featureBranchMatch[1];
        continue;
      }

      const createdMatch = line.match(/^Created:\s*(.+)$/);
      if (createdMatch) {
        metadata.created = createdMatch[1];
        continue;
      }

      const statusMatch = line.match(/^Status:\s*(.+)$/);
      if (statusMatch) {
        const statusValue = statusMatch[1].trim();
        const validStatuses = ['draft', 'in_progress', 'testing', 'completed', 'failed'];
        if (validStatuses.includes(statusValue)) {
          metadata.status = statusValue as
            'draft' | 'in_progress' | 'testing' | 'completed' | 'failed';
        }
        continue;
      }

      const inputMatch = line.match(/^Input:\s*(.+)$/);
      if (inputMatch) {
        metadata.input = inputMatch[1];
        continue;
      }
    }

    const bodyContent = lines.slice(contentStartIndex).join('\n').trim();
    return { metadata, content: bodyContent };
  }

  /**
   * Load a single spec from Gofer format
   */
  private async loadGoferSpec(specId: string): Promise<Spec | null> {
    const specPath = path.join(this.specDir, specId, 'spec.md');

    try {
      const content = await fs.readFile(specPath, 'utf-8');

      // Try YAML frontmatter first (legacy format)
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let frontmatter: SpecMetadata = {};
      let markdownContent: string;

      if (yamlMatch) {
        // Legacy YAML frontmatter format
        const frontmatterText = yamlMatch[1];
        markdownContent = content.slice(yamlMatch[0].length).trim();

        // Simple YAML parsing for basic fields
        const yamlLines = frontmatterText.split('\n');
        for (const line of yamlLines) {
          const match = line.match(/^([^:]+):\s*"?([^"]*)"?$/);
          if (match) {
            frontmatter[match[1].trim()] = match[2].trim();
          }
        }
      } else {
        // Official GitHub Gofer format
        const { metadata, content: bodyContent } = this.parseSpecHeader(content);
        const validStatuses = ['draft', 'in_progress', 'testing', 'completed', 'failed'];
        const statusValue =
          metadata.status && validStatuses.includes(metadata.status)
            ? (metadata.status as 'draft' | 'in_progress' | 'testing' | 'completed' | 'failed')
            : 'draft';

        frontmatter = {
          id: metadata.branch || specId,
          title: metadata.title || 'Untitled',
          status: statusValue,
          created: metadata.created || new Date().toISOString(),
        };
        markdownContent = bodyContent;
      }

      // Load tasks if they exist
      const tasks = await this.loadGoferTasks(specId);

      const now = new Date().toISOString();
      return {
        id: frontmatter.id || specId,
        title: frontmatter.title || 'Untitled',
        status:
          (frontmatter.status as 'draft' | 'in_progress' | 'testing' | 'completed' | 'failed') ||
          'draft',
        created: frontmatter.created || now,
        updated: now,
        priority: 'medium' as const,
        featureBranch: frontmatter.branch || frontmatter.id,
        description: markdownContent.split('\n').slice(0, 3).join('\n'),
        tasks: tasks,
        acceptanceCriteria: [],
        qaRules: [],
      };
    } catch (error) {
      console.error(`Failed to load spec ${specId}:`, error);
      return null;
    }
  }

  /**
   * Load tasks from tasks.md file
   */
  private async loadGoferTasks(specId: string): Promise<Task[]> {
    const tasksPath = path.join(this.specDir, specId, 'tasks.md');

    try {
      const content = await fs.readFile(tasksPath, 'utf-8');
      const tasks: Task[] = [];
      let generatedTaskId = 0;

      // Accept canonical Gofer task IDs while remaining compatible with older
      // bare checklist lines used in legacy tests and fixtures.
      const lines = content.split('\n');
      for (const line of lines) {
        const explicitTaskMatch = line.match(
          /^- \[([xX ])\]\s+(?:\*\*(T\d+)\*\*:?\s*|#?(T\d+)\b\s*)(.*)$/
        );
        if (explicitTaskMatch) {
          const isCompleted = explicitTaskMatch[1].toLowerCase() === 'x';
          const taskId = explicitTaskMatch[2] || explicitTaskMatch[3];
          const description = explicitTaskMatch[4];

          tasks.push({
            id: taskId,
            specId,
            description,
            status: (isCompleted ? 'completed' : 'pending') as TaskStatus,
            dependencies: [],
            deliveryPrompt: description,
            attemptCount: 0,
          });
          continue;
        }

        const bareTaskMatch = line.match(/^- \[([xX ])\]\s+(.+)$/);
        if (!bareTaskMatch) {
          continue;
        }

        generatedTaskId += 1;
        const isCompleted = bareTaskMatch[1].toLowerCase() === 'x';
        const description = bareTaskMatch[2];

        tasks.push({
          id: `task-${generatedTaskId}`,
          specId,
          description,
          status: (isCompleted ? 'completed' : 'pending') as TaskStatus,
          dependencies: [],
          deliveryPrompt: description,
          attemptCount: 0,
        });
      }

      return tasks;
    } catch (_error) {
      // Tasks file is optional
      return [];
    }
  }

  /**
   * Legacy JSON format loader (backwards compatibility)
   */
  private async loadLegacyJsonSpecs(): Promise<Spec[]> {
    try {
      const files = await fs.readdir(this.specDir);
      const specFiles = files.filter((f) => f.endsWith('.json') && f !== 'spec-schema.json');

      const specs = await Promise.all(
        specFiles.map(async (file) => {
          const content = await fs.readFile(path.join(this.specDir, file), 'utf-8');
          return JSON.parse(content) as Spec;
        })
      );

      return specs;
    } catch (error) {
      console.error('Error loading legacy JSON specs:', error);
      return [];
    }
  }

  async loadSpec(specId: string): Promise<Spec | null> {
    if (this.specDir.endsWith('/specs') || this.specDir.endsWith('/specs/')) {
      return this.loadGoferSpec(specId);
    } else {
      // Legacy JSON format - load from all specs
      try {
        const specs = await this.loadAllSpecs();
        return specs.find((s) => s.id === specId) || null;
      } catch (error) {
        console.error(`Error loading spec ${specId}:`, error);
        return null;
      }
    }
  }

  async saveSpec(spec: Spec): Promise<void> {
    if (this.specDir.endsWith('/specs') || this.specDir.endsWith('/specs/')) {
      // For Gofer format, save to spec.md (frontmatter) and tasks.md
      await this.saveGoferSpec(spec);
    } else {
      // Legacy JSON format
      const filePath = path.join(this.specDir, `${spec.id}.json`);
      await this.atomicWriteFile(filePath, JSON.stringify(spec, null, 2));
    }
  }

  private async saveGoferSpec(spec: Spec): Promise<void> {
    const specPath = path.join(this.specDir, spec.id);
    const specMdPath = path.join(specPath, 'spec.md');

    // Update spec.md frontmatter
    try {
      const content = await fs.readFile(specMdPath, 'utf-8');
      const lines = content.split('\n');

      if (lines[0] === '---') {
        const endIndex = lines.findIndex((line, idx) => idx > 0 && line === '---');
        if (endIndex !== -1) {
          // Update status in frontmatter
          const frontmatterLines = lines.slice(1, endIndex);
          const updatedFrontmatter = frontmatterLines.map((line) => {
            if (line.startsWith('status:')) {
              return `status: "${spec.status}"`;
            }
            if (line.startsWith('updated:')) {
              return `updated: "${new Date().toISOString().split('T')[0]}"`;
            }
            return line;
          });

          const newContent = ['---', ...updatedFrontmatter, ...lines.slice(endIndex)].join('\n');

          await this.atomicWriteFile(specMdPath, newContent, 'utf-8');
        }
      }
    } catch (error) {
      console.error(`Failed to update spec.md for ${spec.id}:`, error);
    }

    // Update tasks.md if it exists
    if (spec.tasks && spec.tasks.length > 0) {
      await this.updateTasksMarkdown(spec.id, spec.tasks);
    }
  }

  private async updateTasksMarkdown(specId: string, tasks: Spec['tasks']): Promise<void> {
    const tasksMdPath = path.join(this.specDir, specId, 'tasks.md');

    try {
      const content = await fs.readFile(tasksMdPath, 'utf-8');
      let updatedContent = content;

      // Update each task checkbox based on status
      for (const task of tasks) {
        const taskIdPattern = new RegExp(`(- \\[[ xX]\\]\\s+#?${task.id}\\b)`, 'gm');
        const checkbox = task.status === 'completed' ? '[x]' : '[ ]';
        updatedContent = updatedContent.replace(taskIdPattern, `- ${checkbox} #${task.id}`);
      }

      await this.atomicWriteFile(tasksMdPath, updatedContent, 'utf-8');
    } catch (error) {
      console.error(`Failed to update tasks.md for ${specId}:`, error);
    }
  }

  private async atomicWriteFile(
    targetPath: string,
    content: string,
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    const dir = path.dirname(targetPath);
    const tempPath = path.join(dir, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);

    try {
      await fs.writeFile(tempPath, content, { encoding, flag: 'wx' });
      await fs.rename(tempPath, targetPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async updateTaskStatus(
    specId: string,
    taskId: string,
    status: Spec['tasks'][0]['status']
  ): Promise<void> {
    if (this.specDir.endsWith('/specs') || this.specDir.endsWith('/specs/')) {
      // For Gofer format, update the checkbox in tasks.md
      const spec = await this.loadSpec(specId);
      if (!spec) {
        throw new Error(`Spec ${specId} not found`);
      }

      const task = spec.tasks.find((t) => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in spec ${specId}`);
      }

      // Update task status in memory
      task.status = status;

      // Update the tasks.md file
      await this.updateTasksMarkdown(specId, spec.tasks);
    } else {
      // Legacy JSON format
      const spec = await this.loadSpec(specId);
      if (!spec) {
        throw new Error(`Spec ${specId} not found`);
      }

      const task = spec.tasks.find((t) => t.id === taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in spec ${specId}`);
      }

      task.status = status;
      await this.saveSpec(spec);
    }
  }
}

// Standalone function for backwards compatibility
export async function loadSpecs(): Promise<Spec[]> {
  const loader = new SpecLoader();
  return loader.loadAllSpecs();
}
