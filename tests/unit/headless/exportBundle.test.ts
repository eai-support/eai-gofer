import { describe, expect, it } from 'vitest';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_PORTABLE_SCAFFOLD_PATHS,
  createGoferScaffoldInventoryDigest,
  createGoferExportBundle,
  isPortableGoferScaffoldPath,
  validateAppCapabilityRequirements,
} from '../../../src/headless/index.js';
import { TEST_GOFER_RELEASE_DESCRIPTOR, createValidExportFixture } from './fixtures.js';

describe('createGoferExportBundle', () => {
  it('creates a deterministic, path-sorted handoff and complete manifests', () => {
    const request = createValidExportFixture();
    const first = createGoferExportBundle(request);
    const second = createGoferExportBundle({
      ...request,
      artifacts: [...request.artifacts].reverse(),
      files: [...request.files].reverse(),
      approvals: [...request.approvals].reverse(),
      sources: [...request.sources].reverse(),
    });

    expect(second).toEqual(first);
    expect(first.handoff).toMatchObject({
      schemaVersion: 'eai.gofer.handoff.v1',
      tenantId: 'tenant-1',
      appKey: 'sample-app',
      runId: 'run-3171',
      nextAllowedStage: '5_implement',
      repositoryAction: 'generate',
      auditHistoryPath: '.specify/specs/3171-admin-portal-gofer-stages/audit-history.json',
      capabilityManifestPath: 'src/eai.config/capabilities.generated.json',
      capabilityEvidencePath: '.specify/specs/3171-admin-portal-gofer-stages/app-capabilities.json',
      executionReference: {
        provider: 'eai-workflow',
        executionId: 'execution-1',
      },
    });
    expect(first.handoff.completedStages).toEqual([
      '0_start',
      '1_research',
      '2_specify',
      '3_plan',
      '4_tasks',
    ]);
    expect(first.files.map((file) => file.path)).toEqual(
      [...first.files.map((file) => file.path)].sort()
    );
    expect(first.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '.specify/gofer-version.json' }),
        expect.objectContaining({
          path: '.specify/sources/source-manifest.json',
        }),
        expect.objectContaining({
          path: '.specify/specs/3171-admin-portal-gofer-stages/artifact-manifest.json',
        }),
        expect.objectContaining({
          path: '.specify/specs/3171-admin-portal-gofer-stages/app-capabilities.json',
        }),
        expect.objectContaining({
          path: 'src/eai.config/capabilities.generated.json',
          encoding: 'utf8',
        }),
        expect.objectContaining({
          path: '.specify/specs/3171-admin-portal-gofer-stages/audit-history.json',
        }),
        expect.objectContaining({
          path: '.specify/specs/3171-admin-portal-gofer-stages/gofer-handoff.json',
        }),
      ])
    );
    expect(first.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(first.auditHistory).toMatchObject({
      schemaVersion: 'eai.gofer.audit_history.v1',
      contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      tenantId: 'tenant-1',
      runId: 'run-3171',
    });
    expect(first.auditHistory.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(first.capabilityRequirements).toEqual({
      schemaVersion: 'eai.app_capabilities.v1',
      appKey: 'rates-review',
      requirements: [
        expect.objectContaining({ alias: 'assistant-prompt', capability: 'ai.chat' }),
        expect.objectContaining({ alias: 'primary-workflow', capability: 'workflows.runtime' }),
      ],
    });
    const generatedCapabilityManifest = first.files.find(
      ({ path }) => path === 'src/eai.config/capabilities.generated.json'
    );
    const capabilityEvidence = first.files.find(
      ({ path }) => path === '.specify/specs/3171-admin-portal-gofer-stages/app-capabilities.json'
    );
    expect(JSON.parse(generatedCapabilityManifest!.content)).toEqual(first.capabilityRequirements);
    expect(generatedCapabilityManifest!.content).toBe(capabilityEvidence!.content);
    expect(generatedCapabilityManifest!.sha256).toBe(capabilityEvidence!.sha256);
    const releaseManifest = first.files.find((file) => file.path === '.specify/gofer-version.json');
    expect(JSON.parse(releaseManifest!.content)).toEqual({
      schemaVersion: 'eai.gofer.scaffold.v1',
      contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      goferRelease: TEST_GOFER_RELEASE_DESCRIPTOR,
    });
  });

  it('accepts and canonicalizes optional provider and asset compatibility keys', () => {
    const fixture = createValidExportFixture();
    const requirement = fixture.capabilityRequirements.requirements[0];
    const bundle = createGoferExportBundle({
      ...fixture,
      capabilityRequirements: {
        ...fixture.capabilityRequirements,
        requirements: [
          {
            ...requirement,
            compatibleProviders: ['workflow_engine', 'publicapi'],
            compatibleAssetTypes: ['shared-workflow-*', 'workflow-template'],
          },
        ],
      },
    });

    expect(bundle.capabilityRequirements.requirements[0]).toMatchObject({
      compatibleProviders: ['publicapi', 'workflow_engine'],
      compatibleAssetTypes: ['shared-workflow-*', 'workflow-template'],
    });
  });

  it('enforces the PublicAPI capability manifest wire limits', () => {
    const fixture = createValidExportFixture();
    const requirement = fixture.capabilityRequirements.requirements[0];
    const requirements = Array.from({ length: 100 }, (_, index) => ({
      ...requirement,
      alias: index === 0 ? `a${'b'.repeat(119)}` : `requirement-${index}`,
      capability: index === 0 ? `c${'d'.repeat(159)}` : requirement.capability,
      description: index === 0 ? 'x'.repeat(500) : requirement.description,
      compatibleProviders:
        index === 0
          ? Array.from({ length: 20 }, (__, itemIndex) => `provider-${itemIndex}`)
          : undefined,
    }));

    expect(
      validateAppCapabilityRequirements({
        schemaVersion: 'eai.app_capabilities.v1',
        appKey: `a${'b'.repeat(119)}`,
        requirements,
      }).requirements
    ).toHaveLength(100);

    const overLimitCases = [
      { appKey: `a${'b'.repeat(120)}`, requirements: [requirement] },
      {
        appKey: 'rates-review',
        requirements: [...requirements, { ...requirement, alias: 'extra' }],
      },
      { appKey: 'rates-review', requirements: [{ ...requirement, alias: `a${'b'.repeat(120)}` }] },
      {
        appKey: 'rates-review',
        requirements: [{ ...requirement, capability: `c${'d'.repeat(160)}` }],
      },
      { appKey: 'rates-review', requirements: [{ ...requirement, description: 'x'.repeat(501) }] },
      {
        appKey: 'rates-review',
        requirements: [
          {
            ...requirement,
            compatibleAssetTypes: Array.from({ length: 21 }, (__, index) => `asset-${index}`),
          },
        ],
      },
    ];
    const errors = [
      'at most 120 characters',
      'at most 100 items',
      'at most 120 characters',
      'at most 160 characters',
      'at most 500 characters',
      'at most 20 items',
    ];
    overLimitCases.forEach((manifest, index) => {
      expect(() =>
        validateAppCapabilityRequirements({
          schemaVersion: 'eai.app_capabilities.v1',
          ...manifest,
        })
      ).toThrow(errors[index]);
    });
  });

  it('rejects environment-specific capability data and invalid logical contracts', () => {
    const fixture = createValidExportFixture();
    const valid = fixture.capabilityRequirements.requirements[0];

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        capabilityRequirements: {
          ...fixture.capabilityRequirements,
          requirements: [{ ...valid, tenantId: 'tenant-1' } as typeof valid],
        },
      })
    ).toThrow('contains unsupported fields');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        capabilityRequirements: {
          ...fixture.capabilityRequirements,
          requirements: [valid, { ...valid }],
        },
      })
    ).toThrow('duplicate alias');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        capabilityRequirements: {
          ...fixture.capabilityRequirements,
          requirements: [
            {
              ...valid,
              description:
                'Use tenant record 40795709-be42-4fa5-879b-aec8c3f9b3c3 for this workflow.',
            },
          ],
        },
      })
    ).toThrow('must not contain raw tenant record IDs');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        capabilityRequirements: {
          ...fixture.capabilityRequirements,
          requirements: [
            {
              ...valid,
              compatibleAssetTypes: ['shared-workflow-*', 'shared-workflow-*'],
            },
          ],
        },
      })
    ).toThrow('must not contain duplicate logical keys');
  });

  it.each([
    '.specify/specs/3171-admin-portal-gofer-stages/app-capabilities.json',
    'src/eai.config/capabilities.generated.json',
  ])('does not allow input files to replace generated capability manifest %s', (path) => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: [
          ...fixture.files,
          {
            path,
            content: '{}',
            encoding: 'utf8',
          },
        ],
      })
    ).toThrow(`must not replace generated manifest ${path}`);
  });

  it('refuses to export a legacy run without canonical app identity', () => {
    const request = createValidExportFixture();
    const legacyRun = { ...request.run } as Partial<typeof request.run>;
    delete legacyRun.appKey;

    expect(() =>
      createGoferExportBundle({
        ...request,
        run: legacyRun as typeof request.run,
      })
    ).toThrow('Gofer run is not ready for repository export: appKey is required.');
  });

  it('validates the complete runtime release inventory and excludes runtime state', () => {
    expect(GOFER_PORTABLE_SCAFFOLD_PATHS).toHaveLength(178);
    expect(createGoferScaffoldInventoryDigest(GOFER_PORTABLE_SCAFFOLD_PATHS)).toBe(
      TEST_GOFER_RELEASE_DESCRIPTOR.inventoryDigest
    );
    expect(GOFER_PORTABLE_SCAFFOLD_PATHS.every(isPortableGoferScaffoldPath)).toBe(true);
    expect(
      [
        '.specify/.orchestrator.log',
        '.specify/logs/runtime.jsonl',
        '.specify/specs/feature/plan.md',
        '.specify/state/session.json',
      ].some(isPortableGoferScaffoldPath)
    ).toBe(false);
  });

  it.each([
    '.specify/.gofer-version',
    '.specify/README.md',
    '.specify/spec-schema.json',
    '.specify/hints/global.md',
    '.specify/outputs/codex-config-fragment.toml',
    '.specify/specs/.gitkeep',
    '.specify/state/.gitkeep',
  ])('rejects a scaffold missing pinned inventory path %s', (missingPath) => {
    const fixture = createValidExportFixture();

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: fixture.files.filter((file) => file.path !== missingPath),
      })
    ).toThrow(`Gofer ${TEST_GOFER_RELEASE_DESCRIPTOR.ref} scaffold is missing ${missingPath}`);
  });

  it('rejects a scaffold marker that does not match its pinned version', () => {
    const fixture = createValidExportFixture();

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: fixture.files.map((file) =>
          file.path === '.specify/.gofer-version' ? { ...file, content: '3.7.20\n' } : file
        ),
      })
    ).toThrow(`.specify/.gofer-version must contain ${TEST_GOFER_RELEASE_DESCRIPTOR.version}.`);
  });

  it('rejects runtime state and undeclared feature packs outside the portable scaffold', () => {
    const fixture = createValidExportFixture();

    for (const path of [
      '.specify/.orchestrator.log',
      '.specify/logs/runtime.jsonl',
      '.specify/specs/unrelated-feature/plan.md',
      '.specify/state/session.json',
    ]) {
      expect(() =>
        createGoferExportBundle({
          ...fixture,
          files: [...fixture.files, { path, content: 'runtime', encoding: 'utf8' }],
        })
      ).toThrow(`Gofer export contains undeclared runtime file: ${path}`);
    }
  });

  it('canonicalizes nested logical sets before writing manifests', () => {
    const request = createValidExportFixture();
    const reordered = createGoferExportBundle({
      ...request,
      artifacts: request.artifacts.map((artifact) =>
        artifact.artifactId === 'tasks'
          ? { ...artifact, inputArtifacts: [...artifact.inputArtifacts].reverse() }
          : artifact
      ),
      approvals: request.approvals.map((approval) => ({
        ...approval,
        artifactRefs: [...approval.artifactRefs].reverse(),
      })),
    });

    expect(reordered).toEqual(createGoferExportBundle(request));
  });

  it('commits passed source originals and records their lineage', () => {
    const bundle = createGoferExportBundle(createValidExportFixture());

    expect(
      bundle.files.some((file) => file.path === '.specify/sources/originals/process.txt')
    ).toBe(true);
    expect(bundle.sourceManifest.sources[0]).toMatchObject({
      sourceId: 'source-1',
      scan: { status: 'passed' },
      usedByArtifactIds: ['research'],
    });
  });

  it('omits a blocked original only when the audit manifest records why', () => {
    const fixture = createValidExportFixture();
    const blockedPath = fixture.sources[0].originalPath;
    const blocked = {
      ...fixture,
      sources: [
        {
          ...fixture.sources[0],
          scan: {
            status: 'blocked' as const,
            scannedAt: '2026-07-15T00:01:00.000Z',
            violations: [{ ruleId: 'private-key', description: 'Private key detected.' }],
          },
        },
      ],
      omissions: [
        {
          path: blockedPath,
          reasonCode: 'private_key_detected' as const,
          sourceId: 'source-1',
          detail: 'Private key detected by export safety scan.',
        },
      ],
      files: fixture.files.filter((file) => file.path !== blockedPath),
    };

    const bundle = createGoferExportBundle(blocked);
    expect(bundle.files.some((file) => file.path === blockedPath)).toBe(false);
    expect(bundle.sourceManifest.omissions).toEqual(blocked.omissions);
    expect(bundle.handoff.omissions).toEqual(blocked.omissions);
  });

  it('rejects blocked originals that are still present', () => {
    const fixture = createValidExportFixture();
    const blocked = {
      ...fixture,
      sources: [
        {
          ...fixture.sources[0],
          scan: {
            status: 'blocked' as const,
            scannedAt: '2026-07-15T00:01:00.000Z',
            violations: [{ ruleId: 'secret', description: 'Secret detected.' }],
          },
        },
      ],
      omissions: [
        {
          path: fixture.sources[0].originalPath,
          reasonCode: 'secret_detected' as const,
          sourceId: 'source-1',
          detail: 'Secret detected by export safety scan.',
        },
      ],
    };

    expect(() => createGoferExportBundle(blocked)).toThrow(
      'Blocked source source-1 original must not be committed.'
    );
  });

  it('rejects traversal and incomplete scaffold exports', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: [
          ...fixture.files,
          { path: '.specify/../token.txt', content: 'unsafe', encoding: 'utf8' },
        ],
      })
    ).toThrow('Gofer export path is unsafe or outside .specify');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: fixture.files.filter((file) => file.path !== '.specify/hints/global.md'),
      })
    ).toThrow(
      `Gofer ${TEST_GOFER_RELEASE_DESCRIPTOR.ref} scaffold is missing .specify/hints/global.md`
    );

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        files: [
          ...fixture.files,
          { path: '.specify/./ambiguous.txt', content: 'unsafe', encoding: 'utf8' },
        ],
      })
    ).toThrow('Gofer export path is unsafe or outside .specify');
  });

  it('rejects artifact content that no longer matches approved metadata', () => {
    const fixture = createValidExportFixture();
    const researchPath = fixture.artifacts.find(
      (artifact) => artifact.artifactId === 'research'
    )!.path;
    const files = fixture.files.map((file) =>
      file.path === researchPath ? { ...file, content: '# silently changed' } : file
    );

    expect(() => createGoferExportBundle({ ...fixture, files })).toThrow(
      'Artifact research hash does not match'
    );
  });

  it('rejects cross-run approvals and source byte-length drift', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        approvals: [{ ...fixture.approvals[0], runId: 'another-run' }],
      })
    ).toThrow('Approval approval-tasks belongs to another run.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        sources: [{ ...fixture.sources[0], byteLength: fixture.sources[0].byteLength + 1 }],
      })
    ).toThrow('Source source-1 byteLength does not match its original file.');
  });

  it('rejects audit events owned by another tenant or run', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: [{ ...fixture.events[0], tenantId: 'another-tenant' }, ...fixture.events.slice(1)],
      })
    ).toThrow('Gofer event sequence 1 belongs to another tenant or run.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: [{ ...fixture.events[0], runId: 'another-run' }, ...fixture.events.slice(1)],
      })
    ).toThrow('Gofer event sequence 1 belongs to another tenant or run.');
  });

  it('rejects unsupported event schemas and empty histories', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: [
          {
            ...fixture.events[0],
            schemaVersion: 'unsupported' as typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
          },
          ...fixture.events.slice(1),
        ],
      })
    ).toThrow('Gofer event sequence 1 has an unsupported schemaVersion.');

    expect(() => createGoferExportBundle({ ...fixture, events: [] })).toThrow(
      'Gofer audit history requires at least one run event.'
    );
  });

  it('rejects malformed event types, actors, stages, and timestamps', () => {
    const fixture = createValidExportFixture();
    const replaceSecondEvent = (replacement: (typeof fixture.events)[number]) => [
      fixture.events[0],
      replacement,
      ...fixture.events.slice(2),
    ];

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: replaceSecondEvent({
          ...fixture.events[1],
          type: 'hostile' as (typeof fixture.events)[number]['type'],
        }),
      })
    ).toThrow('Gofer event sequence 2 has an unsupported type.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: replaceSecondEvent({ ...fixture.events[1], actorUserId: '   ' }),
      })
    ).toThrow('Gofer event sequence 2 requires actorUserId.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: replaceSecondEvent({ ...fixture.events[1], stage: undefined }),
      })
    ).toThrow('Gofer event sequence 2 requires a stage.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: replaceSecondEvent({ ...fixture.events[1], createdAt: 'not-a-date' }),
      })
    ).toThrow('Gofer event sequence 2 has an invalid createdAt.');
  });

  it('rejects reordered, duplicated, and gapped event sequences', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({ ...fixture, events: [...fixture.events].reverse() })
    ).toThrow('Gofer event at index 0 must have contiguous sequence 1.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: fixture.events.map((event, index) =>
          index === 1 ? { ...event, sequence: 1 } : event
        ),
      })
    ).toThrow('Gofer event at index 1 must have contiguous sequence 2.');

    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: fixture.events.map((event, index) =>
          index === 1 ? { ...event, sequence: 3 } : event
        ),
      })
    ).toThrow('Gofer event at index 1 must have contiguous sequence 2.');
  });

  it('rejects event timestamps that contradict the canonical sequence order', () => {
    const fixture = createValidExportFixture();
    expect(() =>
      createGoferExportBundle({
        ...fixture,
        events: fixture.events.map((event, index) =>
          index === 2 ? { ...event, createdAt: '2026-07-14T23:00:00.000Z' } : event
        ),
      })
    ).toThrow('Gofer events must be ordered by sequence and nondecreasing createdAt.');
  });
});
