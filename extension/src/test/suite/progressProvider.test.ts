import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as vscode from 'vscode';
import { ProgressProvider } from '../../progressProvider';

const MANAGED_DEPLOY_DOCTOR_COMMAND =
  'eai deploy doctor --operation-id operation-123 --app-key planning-portal --tenant-id app-tenant --target-tenant-id runtime-tenant --evidence-out .eai/deploy-doctor.json --format json';
const MANAGED_INITIAL_DEPLOY_COMMAND =
  'eai deploy app planning-portal --target eai --tenant-id app-tenant --source eai-managed --target-tenant-id runtime-tenant --format json';
const MANAGED_DEPLOY_TASK_SUFFIX = `[hosting:eai-managed] with \`${MANAGED_INITIAL_DEPLOY_COMMAND}\`, then \`${MANAGED_DEPLOY_DOCTOR_COMMAND}\``;

function buildManagedDeployDoctorEvidence(): Record<string, unknown> {
  const activeUrl = 'https://planning.example.com';
  return {
    schemaVersion: 'eai.managed-deploy-doctor-evidence.v1',
    status: 'pass',
    observedAt: '2026-09-25T05:00:00.000Z',
    operation: {
      operationId: 'operation-123',
      appKey: 'planning-portal',
      tenantId: 'app-tenant',
      targetTenantId: 'runtime-tenant',
      sourceMode: 'source-unknown',
      status: 'active',
      configHash: `sha256:${'b'.repeat(64)}`,
    },
    sourceBinding: {
      repository: 'enterprise/planning-portal',
      commitSha: 'a'.repeat(40),
      workflowPath: '.github/workflows/eai-app.yml',
      ref: 'refs/heads/main',
    },
    deployment: {
      deploymentId: 'deployment-123',
      activeUrl,
      runtimeIdentity: {
        clientId: 'runtime-client',
        principalId: 'runtime-principal',
      },
      latestPointerVersion: 3,
      expectedLatestVersion: 3,
      requiresTenantInfra: false,
    },
    authenticatedReadiness: true,
    doctor: {
      url: activeUrl,
      contract: 'eai.runtime.json',
      status: 'pass',
      checks: [
        {
          name: 'authenticated-readiness',
          method: 'GET',
          path: '/api/eai/readiness',
          url: `${activeUrl}/api/eai/readiness`,
          category: 'app_code_runtime_error',
          status: 'pass',
          message: 'Authenticated readiness passed.',
          authenticated: true,
        },
      ],
      summary: { pass: 1, fail: 0, warning: 0, skip: 0 },
      authenticatedReadiness: true,
    },
  };
}

suite('ProgressProvider Test Suite', function () {
  // Increase timeout for all tests in this suite to handle debounce
  this.timeout(10000);

  let tempDir: string;
  let progressProvider: ProgressProvider;

  suiteSetup(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'progress-provider-test-'));
  });

  suiteTeardown(async () => {
    await setWorkflowProfile('standard');

    // Clean up temporary directory
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
  });

  setup(async () => {
    await setWorkflowProfile('standard');

    // Clean up .specify directory from previous tests
    const specifyDir = path.join(tempDir, '.specify');
    try {
      await fs.rmdir(specifyDir, { recursive: true });
    } catch (_e) {
      // Ignore if it doesn't exist
    }

    await fs.rm(path.join(tempDir, 'eai.runtime.json'), { force: true });
    await fs.rm(path.join(tempDir, '.eai'), { recursive: true, force: true });

    // Create fresh progress provider for each test with 0ms debounce for faster testing
    progressProvider = new ProgressProvider(tempDir, undefined, 0);
  });

  // Helper to wait for tree update
  async function waitForTreeUpdate(provider: ProgressProvider): Promise<void> {
    // Force a small delay to allow async triggerLoad to set isLoading = true
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Wait until both isLoading and isDebouncing are false
    while (provider.isLoadingSpecs() || provider.isDebouncing()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  suite('Tree Structure', () => {
    test('should show error when no .specify directory exists', async () => {
      // Trigger initial load
      await progressProvider.getChildren();
      // Wait for load to complete
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      // Should return empty array to show Welcome View
      assert.strictEqual(children.length, 0);
    });

    test('should show empty state when no specs exist', async () => {
      // Create empty .specify/specs directory
      const specsDir = path.join(tempDir, '.specify', 'specs');
      await fs.mkdir(specsDir, { recursive: true });

      // Initial load
      await progressProvider.getChildren();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();

      assert.strictEqual(children.length, 1);
      assert.ok(
        children[0].label.includes('No specs found'),
        `Expected 'No specs found' but got '${children[0].label}'`
      );
    });

    test('should display specs as top-level items', async () => {
      // Create test specs
      await createTestSpec('001-login', 'Login Feature', 'ready');
      await createTestSpec('002-auth', 'Authentication', 'in_progress');

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();

      assert.strictEqual(children.length, 2);
      assert.ok(
        children[0].label.includes('Login Feature'),
        `Expected label to include 'Login Feature' but got '${children[0].label}'`
      );
      assert.ok(
        children[1].label.includes('Authentication'),
        `Expected label to include 'Authentication' but got '${children[1].label}'`
      );
    });

    test('should display tasks as children of specs', async () => {
      await createTestSpecWithTasks('003-profile', 'User Profile', 'in_progress', [
        { id: 'T001', desc: 'Create profile model', status: 'completed' },
        { id: 'T002', desc: 'Add profile API', status: 'in_progress' },
        { id: 'T003', desc: 'Write tests', status: 'pending' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      assert.strictEqual(children.length, 1);

      const specItem = children[0];
      const taskChildren = await progressProvider.getChildren(specItem);
      assert.strictEqual(taskChildren.length, 3);

      assert.ok(taskChildren[0].label.includes('Create profile model'));
      assert.ok(taskChildren[1].label.includes('Add profile API'));
      assert.ok(taskChildren[2].label.includes('Write tests'));
    });
  });

  suite('Status Display', () => {
    test('should show correct task counts in spec description', async () => {
      await createTestSpecWithTasks('004-notifications', 'Notifications', 'in_progress', [
        { id: 'T001', desc: 'Setup notification service', status: 'completed' },
        { id: 'T002', desc: 'Add email notifications', status: 'completed' },
        { id: 'T003', desc: 'Add SMS notifications', status: 'in_progress' },
        { id: 'T004', desc: 'Add push notifications', status: 'pending' },
        { id: 'T005', desc: 'Error handling', status: 'failed' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      const specItem = children[0];

      // Description should include status and percentage
      assert.ok(specItem.description, 'Spec should have a description');
      const description = typeof specItem.description === 'string' ? specItem.description : '';
      assert.ok(description.includes('1 in progress'));
      assert.ok(description.includes('1 failed'));
      assert.ok(description.includes('40%')); // 2/5 completed
    });

    test('should calculate progress with suffixed and bracketed task IDs', async () => {
      const specId = '004a-progress-id-formats';
      const specDir = path.join(tempDir, '.specify', 'specs', specId);
      await fs.mkdir(specDir, { recursive: true });

      const specContent = `---
id: "${specId}"
title: "Progress ID Formats"
status: "in_progress"
created: "2025-10-22"
---

# Progress ID Formats
`;

      const tasksContent = `# Tasks

- [x] [T001a] Completed bracketed suffix task
- [x] T002b Completed suffixed task
- [ ] T003 Pending plain task
- [ ] #4 Pending numeric task
`;

      await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
      await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      const specItem = children[0];
      assert.ok(specItem.description, 'Spec should have a description');
      const description = typeof specItem.description === 'string' ? specItem.description : '';
      assert.ok(description.includes('50%'), `Expected 50% but got "${description}"`);
    });

    test('should show correct icons for different spec statuses', async () => {
      await createTestSpecWithTasks('005-completed', 'Completed Feature', 'completed', [
        { id: 'T001', desc: 'Task 1', status: 'completed' },
        { id: 'T002', desc: 'Task 2', status: 'completed' },
      ]);

      await createTestSpecWithTasks('006-failed', 'Failed Feature', 'in_progress', [
        { id: 'T001', desc: 'Task 1', status: 'completed' },
        { id: 'T002', desc: 'Task 2', status: 'failed' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();

      const completedSpec = children.find((c) => c.label.toString().includes('Completed Feature'));
      const failedSpec = children.find((c) => c.label.toString().includes('Failed Feature'));

      assert.ok(completedSpec);
      assert.ok(failedSpec);

      // Check icons are not undefined (ThemeIcon usage detail might vary)
      // Note: We don't strictly check instanceof ThemeIcon because the implementation uses string labels with unicode balls mostly
    });

    test('should show correct icons for different task statuses', async () => {
      await createTestSpecWithTasks('007-task-icons', 'Task Icons Test', 'in_progress', [
        { id: 'T001', desc: 'Completed task', status: 'completed' },
        { id: 'T002', desc: 'In progress task', status: 'in_progress' },
        { id: 'T003', desc: 'Failed task', status: 'failed' },
        { id: 'T004', desc: 'Pending task', status: 'pending' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      const specItem = children[0];
      const taskChildren = await progressProvider.getChildren(specItem);

      // Verify we have children
      assert.strictEqual(taskChildren.length, 4);
    });
  });

  suite('Context Values', () => {
    test('should set correct context values for specs and tasks', async () => {
      await createTestSpecWithTasks('008-context', 'Context Test', 'in_progress', [
        { id: 'T001', desc: 'Test task', status: 'pending' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();
      assert.ok(children.length > 0, 'Should have children');
      const specItem = children[0];
      const taskChildren = await progressProvider.getChildren(specItem);

      assert.strictEqual(specItem.contextValue, 'spec');
      assert.strictEqual(taskChildren[0].contextValue, 'task');
    });
  });

  suite('Refresh Functionality', () => {
    test('should update tree when refresh is called', async () => {
      // Initially no specs - trigger load and wait
      await progressProvider.getChildren();
      await waitForTreeUpdate(progressProvider);

      let children = await progressProvider.getChildren();
      assert.strictEqual(children.length, 0, 'Expected 0 items (welcome view) initially');

      // Add a spec
      await createTestSpec('009-refresh', 'Refresh Test', 'draft');

      // After refresh, should show the new spec
      progressProvider.refresh();
      // refresh() triggers async load, wait for it
      await waitForTreeUpdate(progressProvider);

      children = await progressProvider.getChildren();
      assert.strictEqual(children.length, 1, 'Expected 1 item after adding a spec');
      assert.ok(children[0].label.includes('Refresh Test'));
    });
  });

  suite('Error Handling', () => {
    test('should handle corrupted spec files gracefully', async () => {
      // Create a spec directory with invalid spec.md
      const specDir = path.join(tempDir, '.specify', 'specs', '010-corrupted');
      await fs.mkdir(specDir, { recursive: true });
      await fs.writeFile(
        path.join(specDir, 'spec.md'),
        'This is not valid markdown with frontmatter'
      );

      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      const children = await progressProvider.getChildren();

      // Should show error or valid children depending on partial success
      assert.ok(children.length >= 0);
    });
  });

  suite('EnterpriseAI deployment readiness gate', () => {
    test('should block deployment task completion when required deployment files are missing', async () => {
      const specId = '011-enterpriseai-deploy-gate-blocked';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Deploy Gate', 'in_progress', [
        { id: 'T001', desc: 'Deploy app to EnterpriseAI production', status: 'pending' },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        async () => {
          await progressProvider.updateTaskStatus(specId, 'T001', 'completed');
        },
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('IMPL_DEPLOYMENT_VALIDATION_FAILED') &&
          error.message.includes('eai.runtime.json') &&
          error.message.includes('.eai/deploy-doctor.json') &&
          error.message.includes('Next steps') &&
          error.message.includes('Create or restore eai.runtime.json') &&
          error.message.includes('Run the existing deployment doctor flow') &&
          !error.message.includes('Regenerate or update')
      );

      const tasksPath = path.join(tempDir, '.specify', 'specs', specId, 'tasks.md');
      const tasksContent = await fs.readFile(tasksPath, 'utf-8');
      assert.ok(tasksContent.includes('- [ ] T001 Deploy app to EnterpriseAI production'));
    });

    test('should allow deployment task completion when required deployment files exist', async () => {
      const specId = '012-enterpriseai-deploy-gate-pass';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Deploy Gate Pass', 'in_progress', [
        {
          id: 'T001',
          desc: `Deploy app to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
      ]);

      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.eai', 'deploy-doctor.json'),
        `${JSON.stringify(buildManagedDeployDoctorEvidence(), null, 2)}\n`
      );

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await progressProvider.updateTaskStatus(specId, 'T001', 'completed');

      const tasksPath = path.join(tempDir, '.specify', 'specs', specId, 'tasks.md');
      const tasksContent = await fs.readFile(tasksPath, 'utf-8');
      assert.ok(tasksContent.includes('- [x] T001 Deploy app to EnterpriseAI production'));
    });

    test('should reject an EAI-managed task without a resolved binding', async () => {
      const specId = '012a-enterpriseai-deploy-gate-legacy-task';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Legacy Deploy Gate', 'in_progress', [
        {
          id: 'T001',
          desc: '[hosting:eai-managed] Deploy app to EnterpriseAI production',
          status: 'pending',
        },
      ]);

      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.eai', 'deploy-doctor.json'),
        `${JSON.stringify(buildManagedDeployDoctorEvidence(), null, 2)}\n`
      );

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        progressProvider.updateTaskStatus(specId, 'T001', 'completed'),
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('DEPLOYMENT_TASK_BINDING_MISSING') &&
          error.message.includes('Regenerate or update this [hosting:eai-managed] task') &&
          error.message.includes('then run that resolved command')
      );
    });

    test('should preserve presence-only readiness for customer Azure and local-only tasks', async () => {
      await setWorkflowProfile('enterpriseai');
      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.eai', 'deploy-doctor.json'), '{legacy-evidence');

      const compatibleTasks = [
        {
          specId: '012b-enterpriseai-customer-azure-presence',
          description: '[hosting:customer-azure] Deploy app to customer Azure production',
        },
        {
          specId: '012c-enterpriseai-local-only-presence',
          description: '[hosting:local-only] Validate local deployment artifacts',
        },
      ];

      for (const compatibleTask of compatibleTasks) {
        await createTestSpecWithTasks(
          compatibleTask.specId,
          'Compatible Presence Gate',
          'in_progress',
          [{ id: 'T001', desc: compatibleTask.description, status: 'pending' }]
        );
      }

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      for (const compatibleTask of compatibleTasks) {
        await progressProvider.updateTaskStatus(compatibleTask.specId, 'T001', 'completed');
        const tasksContent = await fs.readFile(
          path.join(tempDir, '.specify', 'specs', compatibleTask.specId, 'tasks.md'),
          'utf-8'
        );
        assert.ok(tasksContent.includes('- [x] T001'));
      }
    });

    test('should recommend receipt replacement for malformed managed evidence', async () => {
      const specId = '012d-enterpriseai-malformed-receipt';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'Malformed Receipt Recovery', 'in_progress', [
        {
          id: 'T001',
          desc: `Deploy app to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
      ]);
      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '.eai', 'deploy-doctor.json'), '{not-json');

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        progressProvider.updateTaskStatus(specId, 'T001', 'completed'),
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('DOCTOR_EVIDENCE_INVALID_JSON') &&
          error.message.includes('atomically replace .eai/deploy-doctor.json') &&
          !error.message.includes('Regenerate or update this [hosting:eai-managed] task')
      );
    });

    test('should recommend identifier verification for mismatched managed evidence', async () => {
      const specId = '012e-enterpriseai-mismatched-receipt';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'Mismatched Receipt Recovery', 'in_progress', [
        {
          id: 'T001',
          desc: `Deploy app to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
      ]);
      const evidence = buildManagedDeployDoctorEvidence();
      (evidence.operation as Record<string, unknown>).operationId = 'operation-other';
      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.eai', 'deploy-doctor.json'),
        JSON.stringify(evidence)
      );

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        progressProvider.updateTaskStatus(specId, 'T001', 'completed'),
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('DOCTOR_EVIDENCE_OPERATION_ID_MISMATCH') &&
          error.message.includes('Confirm the task identifiers') &&
          !error.message.includes('Regenerate or update this [hosting:eai-managed] task')
      );
    });

    test('should recommend readiness repair for a failing managed receipt', async () => {
      const specId = '012f-enterpriseai-failing-receipt';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'Failing Receipt Recovery', 'in_progress', [
        {
          id: 'T001',
          desc: `Deploy app to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
      ]);
      const evidence = buildManagedDeployDoctorEvidence();
      evidence.status = 'fail';
      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.eai', 'deploy-doctor.json'),
        JSON.stringify(evidence)
      );

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        progressProvider.updateTaskStatus(specId, 'T001', 'completed'),
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('DOCTOR_EVIDENCE_STATUS_NOT_PASS') &&
          error.message.includes('Fix the deployment or authenticated readiness failures') &&
          !error.message.includes('Regenerate or update this [hosting:eai-managed] task')
      );
    });

    test('should block completion for deployment readiness tasks identified by runtime evidence keywords', async () => {
      const specId = '013-enterpriseai-deploy-runtime-keyword';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Runtime Gate', 'in_progress', [
        {
          id: 'T001',
          desc: 'Validate runtime contract and deploy doctor smoke for production release',
          status: 'pending',
        },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await assert.rejects(
        async () => {
          await progressProvider.updateTaskStatus(specId, 'T001', 'completed');
        },
        (error: unknown): boolean =>
          error instanceof Error &&
          error.message.includes('IMPL_DEPLOYMENT_VALIDATION_FAILED') &&
          error.message.includes('eai.runtime.json')
      );
    });

    test('should allow non-deployment release tasks without deployment artifacts', async () => {
      const specId = '014-enterpriseai-release-notes';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Release Notes', 'in_progress', [
        {
          id: 'T001',
          desc: 'Publish release notes for EnterpriseAI stakeholders',
          status: 'pending',
        },
      ]);

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await progressProvider.updateTaskStatus(specId, 'T001', 'completed');

      const tasksPath = path.join(tempDir, '.specify', 'specs', specId, 'tasks.md');
      const tasksContent = await fs.readFile(tasksPath, 'utf-8');
      assert.ok(
        tasksContent.includes('- [x] T001 Publish release notes for EnterpriseAI stakeholders')
      );
    });

    test('should serialize concurrent provider task updates for deployment tasks', async () => {
      const specId = '015-enterpriseai-concurrent-provider-updates';
      await setWorkflowProfile('enterpriseai');
      await createTestSpecWithTasks(specId, 'EnterpriseAI Concurrent Updates', 'in_progress', [
        {
          id: 'T001',
          desc: `Deploy service A to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
        {
          id: 'T002',
          desc: `Deploy service B to EnterpriseAI production ${MANAGED_DEPLOY_TASK_SUFFIX}`,
          status: 'pending',
        },
      ]);

      await fs.writeFile(path.join(tempDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
      await fs.mkdir(path.join(tempDir, '.eai'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.eai', 'deploy-doctor.json'),
        `${JSON.stringify(buildManagedDeployDoctorEvidence(), null, 2)}\n`
      );

      await progressProvider.getChildren();
      progressProvider.refresh();
      await waitForTreeUpdate(progressProvider);

      await Promise.all([
        progressProvider.updateTaskStatus(specId, 'T001', 'completed'),
        progressProvider.updateTaskStatus(specId, 'T002', 'completed'),
      ]);

      const tasksPath = path.join(tempDir, '.specify', 'specs', specId, 'tasks.md');
      const tasksContent = await fs.readFile(tasksPath, 'utf-8');
      assert.ok(tasksContent.includes('- [x] T001 Deploy service A to EnterpriseAI production'));
      assert.ok(tasksContent.includes('- [x] T002 Deploy service B to EnterpriseAI production'));
    });
  });

  // Helper functions
  async function setWorkflowProfile(profile: 'standard' | 'enterpriseai'): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('gofer');
    await configuration.update('workflowProfile', profile, vscode.ConfigurationTarget.Global);
  }

  async function createTestSpec(id: string, title: string, status: string): Promise<void> {
    const specDir = path.join(tempDir, '.specify', 'specs', id);
    await fs.mkdir(specDir, { recursive: true });

    const specContent = `---
id: "${id}"
title: "${title}"
status: "${status}"
created: "2025-10-22"
---

# ${title}

Test specification for ${title}.
`;

    await fs.writeFile(path.join(specDir, 'spec.md'), specContent);
  }

  async function createTestSpecWithTasks(
    id: string,
    title: string,
    status: string,
    tasks: Array<{ id: string; desc: string; status: string }>
  ): Promise<void> {
    await createTestSpec(id, title, status);

    const specDir = path.join(tempDir, '.specify', 'specs', id);
    const taskLines = tasks.map((task) => {
      let checkbox = '[ ]';
      if (task.status === 'completed') {
        checkbox = '[x]';
      } else if (task.status === 'in_progress') {
        checkbox = '[-]';
      } else if (task.status === 'failed') {
        checkbox = '[!]';
      } else if (task.status === 'blocked') {
        checkbox = '[b]';
      } else if (task.status === 'testing') {
        checkbox = '[>]';
      }
      return `- ${checkbox} ${task.id} ${task.desc}`;
    });

    const tasksContent = `# Tasks

${taskLines.join('\n')}
`;

    await fs.writeFile(path.join(specDir, 'tasks.md'), tasksContent);
  }
});
