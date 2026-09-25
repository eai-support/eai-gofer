export const MANAGED_DEPLOY_BINDING = Object.freeze({
  operationId: 'operation-123',
  appKey: 'planning-portal',
  tenantId: 'app-tenant',
  targetTenantId: 'runtime-tenant',
});

export const MANAGED_DEPLOY_TASK_TEXT =
  'Validate the deployed app with `eai deploy doctor --operation-id operation-123 --app-key planning-portal --tenant-id app-tenant --target-tenant-id runtime-tenant --evidence-out .eai/deploy-doctor.json --format json`';

export interface ManagedDeployEvidenceOverrides {
  schemaVersion?: unknown;
  status?: unknown;
  authenticatedReadiness?: unknown;
  operation?: Readonly<Record<string, unknown>>;
  sourceBinding?: Readonly<Record<string, unknown>>;
  deployment?: Readonly<Record<string, unknown>>;
  doctor?: Readonly<Record<string, unknown>>;
}

export function buildManagedDeployDoctorEvidence(
  overrides: ManagedDeployEvidenceOverrides = {}
): Record<string, unknown> {
  const activeUrl = 'https://planning.example.com';
  const checks = [
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
  ];
  const doctor = {
    url: activeUrl,
    contract: 'eai.runtime.json',
    status: 'pass',
    checks,
    summary: { pass: 1, fail: 0, warning: 0, skip: 0 },
    authenticatedReadiness: true,
    ...overrides.doctor,
  };

  return {
    schemaVersion: overrides.schemaVersion ?? 'eai.managed-deploy-doctor-evidence.v1',
    status: overrides.status ?? 'pass',
    observedAt: '2026-09-25T05:00:00.000Z',
    operation: {
      ...MANAGED_DEPLOY_BINDING,
      sourceMode: 'source-unknown',
      status: 'active',
      configHash: `sha256:${'b'.repeat(64)}`,
      ...overrides.operation,
    },
    sourceBinding: {
      repository: 'enterprise/planning-portal',
      commitSha: 'a'.repeat(40),
      workflowPath: '.github/workflows/eai-app.yml',
      ref: 'refs/heads/main',
      ...overrides.sourceBinding,
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
      ...overrides.deployment,
    },
    authenticatedReadiness: overrides.authenticatedReadiness ?? true,
    doctor,
  };
}
