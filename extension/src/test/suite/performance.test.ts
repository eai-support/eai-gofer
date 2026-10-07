import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProgressProvider } from '../../progressProvider.js';
import { ConstitutionProvider } from '../../constitutionProvider.js';
import { GoferParser } from '../../goferParser.js';
import { GoferMigrator } from '../../goferMigrator.js';

/**
 * Performance Tests for Large Repository Scenarios
 *
 * These tests validate extension performance with:
 * - 100+ specifications
 * - 1000+ tasks
 * - Complex dependency graphs
 * - Large constitution documents
 */

suite('Performance Tests', () => {
  let testWorkspacePath: string;
  let performanceTestDir: string;

  suiteSetup(async () => {
    testWorkspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gofer-perf-test-'));
    performanceTestDir = path.join(testWorkspacePath, 'perf-test');
  });

  suiteTeardown(async () => {
    if (fs.existsSync(testWorkspacePath)) {
      fs.rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  setup(async () => {
    // Clean up previous test data
    if (fs.existsSync(performanceTestDir)) {
      fs.rmSync(performanceTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(performanceTestDir, { recursive: true });
  });

  teardown(async () => {
    // Clean up test data
    if (fs.existsSync(performanceTestDir)) {
      fs.rmSync(performanceTestDir, { recursive: true, force: true });
    }
  });

  suite('Large Specification Repository', () => {
    test('should handle 100+ specifications efficiently', async function () {
      this.timeout(10000); // 10 seconds max

      // Create large .specify structure
      const specifyDir = path.join(performanceTestDir, '.specify');
      const specsDir = path.join(specifyDir, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });

      const startTime = Date.now();

      // Generate 150 specifications
      const specCount = 150;
      for (let i = 1; i <= specCount; i++) {
        const specDir = path.join(specsDir, `feature-${i.toString().padStart(3, '0')}`);
        fs.mkdirSync(specDir, { recursive: true });

        const specContent = `---
id: "feature-${i.toString().padStart(3, '0')}"
title: "Feature ${i}"
status: "${i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in_progress' : 'draft'}"
created: "2025-10-${((i % 28) + 1).toString().padStart(2, '0')}"
priority: "${i % 4 === 0 ? 'critical' : i % 4 === 1 ? 'high' : i % 4 === 2 ? 'medium' : 'low'}"
---

# Feature ${i}

## Overview
This is specification number ${i} for performance testing.

## Tasks
${Array.from(
  { length: 10 },
  (_, j) =>
    `- [${Math.random() > 0.5 ? 'x' : ' '}] #T${(i * 10 + j + 1).toString().padStart(3, '0')} Task ${j + 1} for feature ${i} (deps: ${j > 0 ? `T${(i * 10 + j).toString().padStart(3, '0')}` : 'none'})`
).join('\n')}

## Dependencies
- Feature ${Math.max(1, i - 1)}${i > 1 ? `, Feature ${Math.max(1, i - 2)}` : ''}

## Success Metrics
- Performance criteria for feature ${i}
- Load time < 100ms
- Memory usage < 50MB
`;

        fs.writeFileSync(path.join(specDir, 'spec.md'), specContent);
      }

      const generationTime = Date.now() - startTime;
      console.log(`Generated ${specCount} specs in ${generationTime}ms`);

      // Test parser performance
      const parseStartTime = Date.now();
      const parser = new GoferParser(performanceTestDir);

      const allSpecs = await parser.loadAllSpecs();

      const parseTime = Date.now() - parseStartTime;
      console.log(
        `Parsed ${specCount} specs in ${parseTime}ms (${parseTime / specCount}ms per spec)`
      );

      // Verify performance benchmarks
      assert.ok(
        parseTime < 5000,
        `Parsing ${specCount} specs should take < 5 seconds, took ${parseTime}ms`
      );
      assert.ok(
        parseTime / specCount < 50,
        `Average parse time should be < 50ms per spec, was ${parseTime / specCount}ms`
      );

      // Verify all specs were parsed correctly
      assert.strictEqual(allSpecs.length, specCount, 'All specs should be parsed');
      assert.ok(
        allSpecs.every((spec) => spec && spec.id),
        'All specs should have valid data'
      );

      // Test memory usage
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      console.log(`Memory usage: ${heapUsedMB.toFixed(2)}MB heap`);

      // Memory should be reasonable for 150 specs
      assert.ok(heapUsedMB < 200, `Memory usage should be < 200MB, was ${heapUsedMB.toFixed(2)}MB`);
    });

    test('should render tree view efficiently with 1000+ tasks', async function () {
      this.timeout(15000); // 15 seconds max

      // Create specs with many tasks
      const specifyDir = path.join(performanceTestDir, '.specify');
      const specsDir = path.join(specifyDir, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });

      const specCount = 50;
      const tasksPerSpec = 25; // 50 * 25 = 1250 total tasks

      for (let i = 1; i <= specCount; i++) {
        const specDir = path.join(specsDir, `high-task-feature-${i}`);
        fs.mkdirSync(specDir, { recursive: true });

        const tasks = Array.from({ length: tasksPerSpec }, (_, j) => {
          const taskNum = i * 100 + j + 1;
          const status = Math.random() > 0.7 ? 'x' : ' ';
          const deps =
            j > 5 ? `T${i * 100 + j - 1}, T${i * 100 + j - 2}` : j > 0 ? `T${i * 100 + j}` : 'none';
          return `- [${status}] #T${taskNum.toString().padStart(4, '0')} Complex task ${j + 1} with detailed description and long name (deps: ${deps})`;
        }).join('\n');

        const specContent = `---
id: "high-task-feature-${i}"
title: "High Task Count Feature ${i}"
status: "in_progress"
created: "2025-10-20"
---

# High Task Count Feature ${i}

## Tasks
${tasks}

## Notes
This spec has ${tasksPerSpec} tasks for performance testing.
`;

        fs.writeFileSync(path.join(specDir, 'spec.md'), specContent);
      }

      // Test ProgressProvider performance
      const providerStartTime = Date.now();
      const progressProvider = new ProgressProvider(performanceTestDir, undefined, 0);
      progressProvider.getChildren(); // Trigger load

      // Wait for provider to load
      await new Promise((resolve) => setTimeout(resolve, 50));
      while (progressProvider.isLoadingSpecs() || progressProvider.isDebouncing()) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Simulate tree view rendering
      const rootItems = await progressProvider.getChildren();
      assert.ok(
        rootItems.length === specCount,
        `Should have ${specCount} root items, but got ${rootItems.length}`
      );

      let totalTasks = 0;
      for (const rootItem of rootItems) {
        const tasks = await progressProvider.getChildren(rootItem);
        totalTasks += tasks.length;
      }

      const renderTime = Date.now() - providerStartTime;
      console.log(`Rendered tree view with ${totalTasks} tasks in ${renderTime}ms`);

      // Performance assertions
      assert.ok(
        renderTime < 3000,
        `Tree view rendering should take < 3 seconds, took ${renderTime}ms`
      );
      assert.strictEqual(totalTasks, specCount * tasksPerSpec, 'All tasks should be rendered');

      // Test individual spec expansion performance
      const expansionStartTime = Date.now();
      const firstSpec = rootItems[0];
      const firstSpecTasks = await progressProvider.getChildren(firstSpec);
      const expansionTime = Date.now() - expansionStartTime;

      console.log(`Expanded spec with ${firstSpecTasks.length} tasks in ${expansionTime}ms`);
      assert.ok(
        expansionTime < 100,
        `Individual spec expansion should take < 100ms, took ${expansionTime}ms`
      );
    });

    test('should handle large constitution documents efficiently', async function () {
      this.timeout(8000); // 8 seconds max

      const specifyDir = path.join(performanceTestDir, '.specify');
      const memoryDir = path.join(specifyDir, 'memory');
      fs.mkdirSync(memoryDir, { recursive: true });

      // Create large constitution document
      const largeConstitution = `# Project Constitution

## Table of Contents
${Array.from({ length: 50 }, (_, i) => `- [Article ${i + 1}: Section ${i + 1}](#article-${i + 1})`).join('\n')}

${Array.from(
  { length: 50 },
  (_, i) => `
## Article ${i + 1}: Advanced Development Principle ${i + 1}

### Section ${i + 1}.1: Core Requirements
${Array.from({ length: 10 }, (_, j) => `- Requirement ${i + 1}.${j + 1}: Detailed requirement with extensive explanation and multiple subsections that need to be parsed and indexed for search functionality.`).join('\n')}

### Section ${i + 1}.2: Implementation Guidelines
${Array.from({ length: 8 }, (_, j) => `- Guideline ${i + 1}.${j + 1}: Implementation specific guideline with code examples and best practices that developers must follow.`).join('\n')}

### Section ${i + 1}.3: Validation Criteria
${Array.from({ length: 5 }, (_, j) => `- Criteria ${i + 1}.${j + 1}: Specific validation criteria that must be met for compliance with this article.`).join('\n')}

### Section ${i + 1}.4: Examples
\`\`\`typescript
// Example ${i + 1}: Complex TypeScript example
interface Example${i + 1} {
  property${i + 1}: string;
  method${i + 1}(): Promise<Result${i + 1}>;
  complex${i + 1}: {
    nested: {
      deeply: {
        value: number;
      };
    };
  };
}
\`\`\`
`
).join('\n')}

## Appendix: Performance Requirements
- Constitution parsing: < 500ms
- Article indexing: < 200ms  
- Search functionality: < 100ms per query
- Memory usage: < 50MB for full document
`;

      fs.writeFileSync(path.join(memoryDir, 'constitution.md'), largeConstitution);

      const constitutionSize = fs.statSync(path.join(memoryDir, 'constitution.md')).size;
      console.log(`Constitution document size: ${(constitutionSize / 1024).toFixed(2)}KB`);

      // Test ConstitutionProvider performance
      const parseStartTime = Date.now();
      const constitutionProvider = new ConstitutionProvider(performanceTestDir);

      const constitutionItems = await constitutionProvider.getChildren();
      const parseTime = Date.now() - parseStartTime;

      console.log(
        `Parsed constitution with ${constitutionItems.length} articles in ${parseTime}ms`
      );

      // Performance assertions
      assert.ok(
        parseTime < 1000,
        `Constitution parsing should take < 1 second, took ${parseTime}ms`
      );
      assert.ok(constitutionItems.length >= 50, 'Should parse all articles');

      // Test navigation performance
      const navigationStartTime = Date.now();
      let totalSections = 0;
      for (let i = 0; i < Math.min(10, constitutionItems.length); i++) {
        const sections = await constitutionProvider.getChildren(constitutionItems[i]);
        totalSections += sections.length;
      }
      const navigationTime = Date.now() - navigationStartTime;

      console.log(`Navigated ${totalSections} sections in ${navigationTime}ms`);
      assert.ok(
        navigationTime < 500,
        `Section navigation should take < 500ms, took ${navigationTime}ms`
      );
    });

    test('should handle complex dependency graphs efficiently', async function () {
      this.timeout(12000); // 12 seconds max

      const specifyDir = path.join(performanceTestDir, '.specify');
      const specsDir = path.join(specifyDir, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });

      // Create specs with complex dependency relationships
      const specCount = 100;
      const maxDepsPerTask = 5;

      for (let i = 1; i <= specCount; i++) {
        const specDir = path.join(specsDir, `complex-deps-${i.toString().padStart(3, '0')}`);
        fs.mkdirSync(specDir, { recursive: true });

        // Generate tasks with complex dependencies
        const tasks = Array.from({ length: 15 }, (_, j) => {
          const taskId = `T${(i * 100 + j + 1).toString().padStart(4, '0')}`;

          // Create complex dependency chains
          const deps = [];
          if (j > 0) {
            // Depend on previous task in same spec
            deps.push(`T${(i * 100 + j).toString().padStart(4, '0')}`);
          }
          if (j > 2) {
            // Depend on task from 2 steps back
            deps.push(`T${(i * 100 + j - 1).toString().padStart(4, '0')}`);
          }
          if (i > 1 && j < 5) {
            // Cross-spec dependencies for early tasks
            deps.push(`T${((i - 1) * 100 + j + 1).toString().padStart(4, '0')}`);
          }
          if (i > 10 && j === 0) {
            // Complex cross-spec dependency for first task
            deps.push(`T${((i - 5) * 100 + 10).toString().padStart(4, '0')}`);
            deps.push(`T${((i - 10) * 100 + 15).toString().padStart(4, '0')}`);
          }

          const depString = deps.length > 0 ? deps.slice(0, maxDepsPerTask).join(', ') : 'none';
          const status = Math.random() > 0.6 ? 'x' : ' ';

          return `- [${status}] #${taskId} Complex task ${j + 1} with multiple dependencies (deps: ${depString})`;
        }).join('\n');

        const specContent = `---
id: "complex-deps-${i.toString().padStart(3, '0')}"
title: "Complex Dependencies Feature ${i}"
status: "in_progress"
created: "2025-10-20"
dependencies: ${i > 1 ? `["complex-deps-${(i - 1).toString().padStart(3, '0')}"]` : '[]'}
---

# Complex Dependencies Feature ${i}

## Tasks
${tasks}

## Cross-Spec Dependencies
${i > 1 ? `- Depends on: complex-deps-${(i - 1).toString().padStart(3, '0')}` : '- None (root spec)'}
${i > 10 ? `- Complex dependency on: complex-deps-${(i - 5).toString().padStart(3, '0')}, complex-deps-${(i - 10).toString().padStart(3, '0')}` : ''}
`;

        fs.writeFileSync(path.join(specDir, 'spec.md'), specContent);
      }

      // Test dependency parsing performance
      const dependencyStartTime = Date.now();
      const parser = new GoferParser(performanceTestDir);

      const specsWithDeps = await parser.loadAllSpecs();

      const dependencyParseTime = Date.now() - dependencyStartTime;
      console.log(
        `Parsed ${specCount} specs with complex dependencies in ${dependencyParseTime}ms`
      );

      // Performance assertions
      assert.ok(
        dependencyParseTime < 8000,
        `Dependency parsing should take < 8 seconds, took ${dependencyParseTime}ms`
      );

      // Verify dependency structure
      const totalTasksParsed = specsWithDeps.reduce(
        (sum, spec) => sum + (spec.tasks?.length || 0),
        0
      );
      console.log(`Total tasks parsed: ${totalTasksParsed}`);
      assert.ok(
        totalTasksParsed >= 1500,
        `Should parse all tasks correctly, but got ${totalTasksParsed}`
      );

      // Test ProgressProvider performance with dependencies
      const progressProvider = new ProgressProvider(performanceTestDir, undefined, 0);
      progressProvider.getChildren(); // Trigger load

      // Wait for provider to load
      await new Promise((resolve) => setTimeout(resolve, 50));
      while (progressProvider.isLoadingSpecs() || progressProvider.isDebouncing()) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const rootItems = await progressProvider.getChildren();
      let totalTasksInProvider = 0;
      for (const rootItem of rootItems) {
        const tasks = await progressProvider.getChildren(rootItem);
        totalTasksInProvider += tasks.length;
      }
      console.log(`Total tasks in provider: ${totalTasksInProvider}`);
      assert.ok(
        totalTasksInProvider >= 1500,
        `Provider should show all tasks, but got ${totalTasksInProvider}`
      );

      // Test dependency resolution performance (simulated)
      const resolutionStartTime = Date.now();
      let resolvedDependencies = 0;

      for (const spec of specsWithDeps) {
        if (spec.tasks) {
          for (const task of spec.tasks) {
            if (task.dependencies && task.dependencies.length > 0) {
              // Simulate dependency resolution
              resolvedDependencies += task.dependencies.length;
            }
          }
        }
      }

      const resolutionTime = Date.now() - resolutionStartTime;
      console.log(`Resolved ${resolvedDependencies} dependencies in ${resolutionTime}ms`);
      assert.ok(
        resolutionTime < 2000,
        `Dependency resolution should take < 2 seconds, took ${resolutionTime}ms`
      );
    });
  });

  suite('Migration Performance', () => {
    test('should migrate large legacy repositories efficiently', async function () {
      this.timeout(30000); // 30 seconds max

      // Create large legacy JSON structure
      const legacyDir = path.join(performanceTestDir, 'legacy-large');
      fs.mkdirSync(legacyDir, { recursive: true });

      const specCount = 75;
      const legacySpecs = Array.from({ length: specCount }, (_, i) => ({
        id: `legacy-spec-${i + 1}`,
        title: `Legacy Specification ${i + 1}`,
        status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in-progress' : 'pending',
        created: `2025-10-${((i % 28) + 1).toString().padStart(2, '0')}`,
        tasks: Array.from({ length: 20 }, (_, j) => ({
          id: `T${((i + 1) * 100 + j + 1).toString().padStart(4, '0')}`,
          title: `Legacy task ${j + 1} for spec ${i + 1}`,
          status: Math.random() > 0.5 ? 'completed' : 'pending',
          dependencies: j > 0 ? [`T${((i + 1) * 100 + j).toString().padStart(4, '0')}`] : [],
          description: `Detailed description for legacy task ${j + 1} in specification ${i + 1}. This task involves complex operations and multiple steps that need to be preserved during migration.`,
        })),
      }));

      fs.writeFileSync(
        path.join(legacyDir, 'specs.json'),
        JSON.stringify({ specs: legacySpecs }, null, 2)
      );

      const legacySize = fs.statSync(path.join(legacyDir, 'specs.json')).size;
      console.log(`Legacy JSON size: ${(legacySize / 1024).toFixed(2)}KB`);

      // Test migration performance
      const migrationStartTime = Date.now();
      const migrator = new GoferMigrator(legacyDir);

      const exists = await migrator.exists();
      assert.ok(exists, 'Legacy structure should be detected');

      await migrator.upgrade({ skipConfirmation: true });
      const migrationTime = Date.now() - migrationStartTime;

      console.log(`Migrated ${specCount} specs with ${specCount * 20} tasks in ${migrationTime}ms`);

      // Performance assertions
      assert.ok(
        migrationTime < 10000,
        `Migration should take < 10 seconds, took ${migrationTime}ms`
      );

      // Verify migration results
      const migratedSpecsDir = path.join(legacyDir, '.specify', 'specs');
      assert.ok(fs.existsSync(migratedSpecsDir), 'Migrated specs directory should exist');

      const migratedSpecs = fs.readdirSync(migratedSpecsDir);
      assert.strictEqual(migratedSpecs.length, specCount, 'All specs should be migrated');

      // Verify a sample migrated spec
      const sampleSpec = migratedSpecs[0];
      const sampleSpecPath = path.join(migratedSpecsDir, sampleSpec, 'spec.md');
      const sampleTasksPath = path.join(migratedSpecsDir, sampleSpec, 'tasks.md');
      assert.ok(fs.existsSync(sampleSpecPath), 'Sample spec file should exist');
      assert.ok(fs.existsSync(sampleTasksPath), 'Sample tasks file should exist');

      const sampleContent = fs.readFileSync(sampleSpecPath, 'utf8');
      const sampleTasksContent = fs.readFileSync(sampleTasksPath, 'utf8');
      assert.ok(sampleContent.includes('---'), 'Should have YAML frontmatter');
      assert.ok(sampleContent.includes('# Legacy Specification'), 'Should preserve title');
      assert.ok(
        sampleTasksContent.includes('- [ ]') || sampleTasksContent.includes('- [x]'),
        'Should have task list'
      );
    });
  });

  suite('Memory and Resource Management', () => {
    test('should maintain reasonable memory usage under load', async function () {
      this.timeout(20000); // 20 seconds max

      const initialMemory = process.memoryUsage();
      console.log(`Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Simulate heavy workload
      const workloadResults = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        // Create temporary large spec structure
        const tempDir = path.join(performanceTestDir, `temp-${i}`);
        fs.mkdirSync(tempDir, { recursive: true });

        const specifyDir = path.join(tempDir, '.specify', 'specs');
        fs.mkdirSync(specifyDir, { recursive: true });

        // Generate multiple specs per iteration
        for (let j = 0; j < 20; j++) {
          const specDir = path.join(specifyDir, `load-test-${i}-${j}`);
          fs.mkdirSync(specDir, { recursive: true });

          const specContent = `---
id: "load-test-${i}-${j}"
title: "Load Test Spec ${i}-${j}"
status: "draft"
---

# Load Test ${i}-${j}

${Array.from({ length: 50 }, (_, k) => `## Section ${k + 1}\nContent for section ${k + 1} in spec ${i}-${j}.`).join('\n\n')}

## Tasks
${Array.from({ length: 30 }, (_, k) => `- [ ] #T${i}${j}${k.toString().padStart(2, '0')} Task ${k + 1} (deps: none)`).join('\n')}
`;

          fs.writeFileSync(path.join(specDir, 'spec.md'), specContent);
        }

        // Parse specs to simulate workload
        const provider = new ProgressProvider(tempDir, undefined, 0);

        provider.getChildren();
        await new Promise((resolve) => setTimeout(resolve, 50));
        while (provider.isLoadingSpecs() || provider.isDebouncing()) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const specs = await provider.getChildren();
        workloadResults.push(specs.length);

        // Check memory after each iteration
        const currentMemory = process.memoryUsage();
        const heapUsedMB = currentMemory.heapUsed / 1024 / 1024;
        console.log(
          `Iteration ${i + 1}: ${heapUsedMB.toFixed(2)}MB heap, processed ${specs.length} specs`
        );

        // Clean up to prevent excessive disk usage
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Memory should not grow excessively
        assert.ok(
          heapUsedMB < 500,
          `Memory usage should stay < 500MB, was ${heapUsedMB.toFixed(2)}MB at iteration ${i + 1}`
        );
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB`);

      // Memory growth should be reasonable
      assert.ok(
        memoryGrowth < 100,
        `Memory growth should be < 100MB, was ${memoryGrowth.toFixed(2)}MB`
      );
      assert.ok(
        workloadResults.every((count) => count === 20),
        'All iterations should process correct number of specs'
      );
    });
  });

  suite('Concurrent Operations', () => {
    test('loads 50 specs within the latency bound and matches individual reads', async function () {
      this.timeout(15000); // 15 seconds max

      // Create multiple spec directories
      const specifyDir = path.join(performanceTestDir, '.specify');
      const specsDir = path.join(specifyDir, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });

      const specCount = 50;
      const specPaths = [];

      // Create specs for concurrent testing
      for (let i = 1; i <= specCount; i++) {
        const specDir = path.join(specsDir, `concurrent-test-${i}`);
        fs.mkdirSync(specDir, { recursive: true });

        const specFile = path.join(specDir, 'spec.md');
        const specContent = `---
id: "concurrent-test-${i}"
title: "Concurrent Test ${i}"
status: "draft"
---

# Concurrent Test ${i}
`;

        fs.writeFileSync(specFile, specContent);

        const tasksContent = `# Tasks\n${Array.from({ length: 10 }, (_, j) => `- [ ] #T${i}${j.toString().padStart(2, '0')} Task ${j + 1} (deps: ${j > 0 ? `T${i}${(j - 1).toString().padStart(2, '0')}` : 'none'})`).join('\n')}\n`;
        fs.writeFileSync(path.join(specDir, 'tasks.md'), tasksContent);
        specPaths.push(specFile);
      }

      // Test concurrent parsing
      const concurrentStartTime = Date.now();
      const parser = new GoferParser(performanceTestDir);

      // Load all specs concurrently using the parser's built-in method
      const results = await parser.loadAllSpecs();
      const concurrentTime = Date.now() - concurrentStartTime;

      console.log(`Concurrent parsing of ${specCount} specs completed in ${concurrentTime}ms`);

      const expectedSpecIds = Array.from(
        { length: specCount },
        (_, index) => `concurrent-test-${index + 1}`
      ).sort();
      assert.ok(
        concurrentTime < 5000,
        `Concurrent parsing should take < 5 seconds, took ${concurrentTime}ms`
      );
      assert.strictEqual(results.length, specCount, 'All specs should be parsed');
      assert.deepStrictEqual(
        results.map((spec) => spec.id).sort(),
        expectedSpecIds,
        'Bulk loading should return every fixture spec exactly once'
      );
      for (const spec of results) {
        const specNumber = Number(spec.id.slice('concurrent-test-'.length));
        assert.strictEqual(spec.title, `Concurrent Test ${specNumber}`);
        assert.strictEqual(spec.status, 'draft');
        assert.deepStrictEqual(
          spec.tasks.map((task) => task.id),
          Array.from(
            { length: 10 },
            (_, index) => `T${specNumber}${index.toString().padStart(2, '0')}`
          )
        );
        assert.ok(spec.tasks.every((task) => task.status === 'pending'));
      }

      const sequentialResults = [];
      for (let i = 1; i <= specCount; i++) {
        const specId = `concurrent-test-${i}`;
        sequentialResults.push(await parser.loadSpec(specId));
      }
      assert.deepStrictEqual(
        sequentialResults.map((spec) => spec.id).sort(),
        expectedSpecIds,
        'Individual reads should return every fixture spec exactly once'
      );
      const comparable = (spec: (typeof results)[number]) => ({
        id: spec.id,
        title: spec.title,
        status: spec.status,
        tasks: spec.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          dependencies: task.dependencies,
        })),
      });
      assert.deepStrictEqual(
        results.map(comparable).sort((a, b) => a.id.localeCompare(b.id)),
        sequentialResults.map(comparable).sort((a, b) => a.id.localeCompare(b.id)),
        'Bulk and individual reads should produce the same spec and task data'
      );
    });
  });
});
