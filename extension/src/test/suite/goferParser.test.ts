import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { GoferParser, Spec, Task } from '../../goferParser';

suite('GoferParser Test Suite', function () {
  this.timeout(10000);
  let tempDir: string;
  let parser: GoferParser;

  setup(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-test-'));
    parser = new GoferParser(tempDir);
  });

  teardown(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  suite('YAML Frontmatter Parsing', () => {
    test('should parse valid YAML frontmatter', async () => {
      // Create test spec directory
      const specDir = path.join(tempDir, '.specify', 'specs', '001-test-spec');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "001-test-spec"
title: "Test Specification"
status: "draft"
created: "2025-10-22"
updated: "2025-10-22"
---

# Test Specification

This is a test specification.

## Acceptance Criteria

- [ ] AC1: Basic functionality works
- [ ] AC2: Error handling is implemented
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);

      const spec = await parser.loadSpec('001-test-spec');

      assert.strictEqual(spec.id, '001-test-spec');
      assert.strictEqual(spec.title, 'Test Specification');
      assert.strictEqual(spec.status, 'draft');
      assert.ok(spec.created instanceof Date);
      assert.ok(spec.updated instanceof Date);
    });

    test('should handle missing YAML frontmatter gracefully', async () => {
      const specDir = path.join(tempDir, '.specify', 'specs', '002-no-frontmatter');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `# Test Specification Without Frontmatter

This spec has no YAML frontmatter.
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);

      const spec = await parser.loadSpec('002-no-frontmatter');

      // Should use defaults when frontmatter is missing
      assert.strictEqual(spec.id, '002-no-frontmatter');
      assert.strictEqual(spec.status, 'draft');
      assert.ok(spec.created instanceof Date);
    });

    test('should handle malformed YAML frontmatter', async () => {
      const specDir = path.join(tempDir, '.specify', 'specs', '003-bad-yaml');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "003-bad-yaml"
title: "Bad YAML Test
status: invalid-yaml-here: [
---

# Test Spec with Bad YAML
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);

      // Should not throw an error, but handle gracefully
      const spec = await parser.loadSpec('003-bad-yaml');
      assert.strictEqual(spec.id, '003-bad-yaml');
    });
  });

  suite('Task Parsing', () => {
    test('should parse tasks with dependencies and parallel markers', async () => {
      const specDir = path.join(tempDir, '.specify', 'specs', '004-task-test');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "004-task-test"
title: "Task Test Spec"
status: "draft"
created: "2025-10-22"
---

# Task Test Spec
`;

      const tasksContent = `# Tasks

## Phase 1: Setup

- [ ] T001 Create basic structure
- [ ] T002 [P] Setup dependencies (deps: T001)
- [x] T003 [P] Configure build system (deps: T001)
- [ ] T004 Integration test (deps: T002, T003)

## Phase 2: Implementation

- [ ] T005 Implement core logic (deps: T004)
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      const spec = await parser.loadSpec('004-task-test');

      assert.strictEqual(spec.tasks.length, 5);

      const t001 = spec.tasks.find((t: Task) => t.id === 'T001');
      assert.ok(t001);
      assert.strictEqual(t001.description, 'Create basic structure');
      assert.strictEqual(t001.status, 'pending');
      assert.strictEqual(t001.parallel, false);
      assert.deepStrictEqual(t001.dependencies, []);

      const t002 = spec.tasks.find((t: Task) => t.id === 'T002');
      assert.ok(t002);
      assert.strictEqual(t002.parallel, true);
      assert.deepStrictEqual(t002.dependencies, ['T001']);

      const t003 = spec.tasks.find((t: Task) => t.id === 'T003');
      assert.ok(t003);
      assert.strictEqual(t003.status, 'completed');
      assert.strictEqual(t003.parallel, true);

      const t004 = spec.tasks.find((t: Task) => t.id === 'T004');
      assert.ok(t004);
      assert.deepStrictEqual(t004.dependencies, ['T002', 'T003']);
    });

    test('should handle tasks without dependencies', async () => {
      const specDir = path.join(tempDir, '.specify', 'specs', '005-simple-tasks');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "005-simple-tasks"
title: "Simple Tasks Test"
status: "draft"
created: "2025-10-22"
---

# Simple Tasks Test
`;

      const tasksContent = `# Tasks

- [ ] T001 Simple task without dependencies
- [x] T002 Completed simple task
- [ ] T003 [P] Parallel task without dependencies
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      const spec = await parser.loadSpec('005-simple-tasks');

      assert.strictEqual(spec.tasks.length, 3);

      spec.tasks.forEach((task: Task) => {
        assert.deepStrictEqual(task.dependencies, []);
      });

      const t002 = spec.tasks.find((t: Task) => t.id === 'T002');
      assert.ok(t002);
      assert.strictEqual(t002.status, 'completed');
    });

    test('should parse bracketed IDs, suffixed IDs, and modern checkbox markers', async () => {
      const specDir = path.join(tempDir, '.specify', 'specs', '005-extended-task-formats');
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "005-extended-task-formats"
title: "Extended Task Formats"
status: "draft"
created: "2025-10-22"
---

# Extended Task Formats
`;

      const tasksContent = `# Tasks

- [x] [T001] Bracketed completed task
- [~] T002a In progress suffixed task
- [ ] **T003b**: Bold suffixed task
- [ ] T004: Colon format task
- [ ] #T005c Hash-prefixed suffixed task
- [ ] #6 Numeric task format
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      const spec = await parser.loadSpec('005-extended-task-formats');
      assert.strictEqual(spec.tasks.length, 6);

      const t001 = spec.tasks.find((t: Task) => t.id === 'T001');
      assert.ok(t001);
      assert.strictEqual(t001.status, 'completed');

      const t002a = spec.tasks.find((t: Task) => t.id === 'T002a');
      assert.ok(t002a);
      assert.strictEqual(t002a.status, 'in_progress');

      const t003b = spec.tasks.find((t: Task) => t.id === 'T003b');
      assert.ok(t003b);

      const t004 = spec.tasks.find((t: Task) => t.id === 'T004');
      assert.ok(t004);

      const t005c = spec.tasks.find((t: Task) => t.id === 'T005c');
      assert.ok(t005c);

      const t006 = spec.tasks.find((t: Task) => t.id === 'T006');
      assert.ok(t006);
    });
  });

  suite('Multiple Specs Loading', () => {
    test('should load all specs from directory', async () => {
      // Create multiple spec directories
      const specs = ['006-spec-a', '007-spec-b', '008-spec-c'];

      for (const specId of specs) {
        const specDir = path.join(tempDir, '.specify', 'specs', specId);
        await fs.mkdir(specDir, { recursive: true });

        const specContent = `---
id: "${specId}"
title: "${specId.toUpperCase()} Title"
status: "draft"
created: "2025-10-22"
---

# ${specId.toUpperCase()}
`;

        await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      }

      const allSpecs = await parser.loadAllSpecs();

      assert.strictEqual(allSpecs.length, 3); // 3 created in this test

      // Check that all our new specs are loaded
      const specIds = allSpecs.map((s: Spec) => s.id);
      for (const specId of specs) {
        assert.ok(specIds.includes(specId));
      }
    });

    test('should handle empty specs directory gracefully', async () => {
      const emptyTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-gofer-test-'));
      const emptyParser = new GoferParser(emptyTempDir);

      const specs = await emptyParser.loadAllSpecs();
      assert.strictEqual(specs.length, 0);

      await fs.rm(emptyTempDir, { recursive: true, force: true });
    });
  });

  suite('Error Handling', () => {
    test('should handle non-existent spec gracefully', async () => {
      try {
        await parser.loadSpec('999-does-not-exist');
        assert.fail('Expected an error to be thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('999-does-not-exist') || error.message.includes('ENOENT'));
      }
    });

    test('should skip malformed specs when loading all specs', async () => {
      // Create a directory without spec.md
      const brokenSpecDir = path.join(tempDir, '.specify', 'specs', '010-broken-spec');
      await fs.mkdir(brokenSpecDir, { recursive: true });
      await fs.writeFile(path.join(brokenSpecDir, 'README.md'), 'This is not a spec.md');

      const allSpecs = await parser.loadAllSpecs();

      // Should load other specs but skip the broken one
      const brokenSpec = allSpecs.find((s: Spec) => s.id === '010-broken-spec');
      assert.strictEqual(brokenSpec, undefined);
    });
  });

  suite('Status Updates', () => {
    test('should update task status', async () => {
      const specId = '011-status-test';
      const specDir = path.join(tempDir, '.specify', 'specs', specId);
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "${specId}"
title: "Status Update Test"
status: "draft"
created: "2025-10-22"
---

# Status Update Test
`;

      const tasksContent = `# Tasks

- [ ] **T001**: Test task for status update
- [ ] **T002**: Another test task
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      // Update task status
      await parser.updateTaskStatus(specId, 'T001', 'completed');

      // Reload and verify
      const spec = await parser.loadSpec(specId);
      const t001 = spec.tasks.find((t: Task) => t.id === 'T001');
      assert.ok(t001, 'Should find task T001');
      assert.strictEqual(t001.status, 'completed');

      // Check that file was actually updated
      const updatedTasksContent = await fs.readFile(path.join(specDir, 'tasks.md'), 'utf-8');
      assert.ok(
        updatedTasksContent.includes('- [x] **T001**'),
        'File should contain checked box for T001'
      );
    });

    test('should serialize concurrent task status updates for the same spec', async () => {
      const specId = '011b-status-concurrency-test';
      const specDir = path.join(tempDir, '.specify', 'specs', specId);
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "${specId}"
title: "Concurrent Task Status Update Test"
status: "draft"
created: "2025-10-22"
---

# Concurrent Task Status Update Test
`;

      const tasksContent = `# Tasks

- [ ] **T001**: First concurrent update
- [ ] **T002**: Second concurrent update
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      await Promise.all([
        parser.updateTaskStatus(specId, 'T001', 'completed'),
        parser.updateTaskStatus(specId, 'T002', 'completed'),
      ]);

      const updatedTasksContent = await fs.readFile(path.join(specDir, 'tasks.md'), 'utf-8');
      assert.ok(
        updatedTasksContent.includes('- [x] **T001**'),
        'File should contain checked box for T001 after concurrent updates'
      );
      assert.ok(
        updatedTasksContent.includes('- [x] **T002**'),
        'File should contain checked box for T002 after concurrent updates'
      );
    });

    test('should update spec status', async () => {
      const specId = '012-spec-status-test';
      const specDir = path.join(tempDir, '.specify', 'specs', specId);
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "${specId}"
title: "Spec Status Update Test"
status: "draft"
created: "2025-10-22"
---

# Spec Status Update Test
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);

      // Update spec status
      await parser.updateSpecStatus(specId, 'in_progress');

      // Reload and verify
      const spec = await parser.loadSpec(specId);
      assert.strictEqual(spec.status, 'in_progress');

      // Check that file was actually updated (might be status: in_progress or status: "in_progress")
      const updatedSpecContent = await fs.readFile(path.join(specDir, 'spec.md'), 'utf-8');
      assert.ok(
        updatedSpecContent.includes('status: in_progress') ||
          updatedSpecContent.includes('status: "in_progress"')
      );
    });

    test('should update suffixed and bracketed task IDs', async () => {
      const specId = '013-task-status-suffix-test';
      const specDir = path.join(tempDir, '.specify', 'specs', specId);
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "${specId}"
title: "Task Suffix Status Update Test"
status: "draft"
created: "2025-10-22"
---

# Task Suffix Status Update Test
`;

      const tasksContent = `# Tasks

- [ ] [T001a] Bracketed suffix task
- [ ] T002b Plain suffix task
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      await parser.updateTaskStatus(specId, 'T001a', 'completed');
      await parser.updateTaskStatus(specId, 'T002b', 'in_progress');

      const spec = await parser.loadSpec(specId);
      const t001a = spec.tasks.find((t: Task) => t.id === 'T001a');
      const t002b = spec.tasks.find((t: Task) => t.id === 'T002b');
      assert.ok(t001a, 'Should find task T001a');
      assert.ok(t002b, 'Should find task T002b');
      assert.strictEqual(t001a.status, 'completed');
      assert.strictEqual(t002b.status, 'in_progress');

      const updatedTasksContent = await fs.readFile(path.join(specDir, 'tasks.md'), 'utf-8');
      assert.ok(
        updatedTasksContent.includes('- [x] [T001a]'),
        'File should contain checked box for bracketed T001a'
      );
      assert.ok(
        updatedTasksContent.includes('- [-] T002b'),
        'File should contain in-progress box for suffixed T002b'
      );
    });

    test('should reject invalid spec IDs when updating task status', async () => {
      await assert.rejects(
        parser.updateTaskStatus('../malicious', 'T001', 'completed'),
        /Invalid spec ID/
      );
    });

    test('should reject invalid spec IDs when updating spec status', async () => {
      await assert.rejects(
        parser.updateSpecStatus('../malicious', 'in_progress'),
        /Invalid spec ID/
      );
    });
  });
});
