import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  EVENT_PAYLOAD_CONTRACT_IDS,
  type EventContractId,
  validateEventPayload,
} from '../../extension/src/services/enterpriseai/contracts/EventPayloadSchemas';
import { validateProducerConsumerEventPayloads } from '../../extension/src/services/enterpriseai/contracts/EventPayloadValidator';
import { createCapabilityRemovalEventHandlers } from '../../extension/src/services/enterpriseai/events/CapabilityRemovalEvents';
import { createCompatibilityParityEventHandlers } from '../../extension/src/services/enterpriseai/events/CompatibilityParityEvents';
import { createDeploymentReadinessEventHandlers } from '../../extension/src/services/enterpriseai/events/DeploymentReadinessEvents';
import { createMirrorPropagationEventHandlers } from '../../extension/src/services/enterpriseai/events/MirrorPropagationEvents';
import { createPositioningEventHandlers } from '../../extension/src/services/enterpriseai/events/PositioningEvents';
import { createReferenceFallbackEventHandlers } from '../../extension/src/services/enterpriseai/events/ReferenceFallbackEvents';
import { createResearchArtifactEventHandlers } from '../../extension/src/services/enterpriseai/events/ResearchArtifactEvents';
import { createStakeholderCommsEventHandlers } from '../../extension/src/services/enterpriseai/events/StakeholderCommsEvents';
import { generateBusinessAndMarketArtifacts } from '../../extension/src/services/enterpriseai/internalApi/GenerateBusinessAndMarketArtifacts';
import { generateEnterpriseAiPlanAndTasks } from '../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';
import { generateStakeholderArtifacts } from '../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';
import { propagateCanonicalMirrors } from '../../extension/src/services/enterpriseai/internalApi/PropagateCanonicalMirrors';
import { recordArchitectureDecisionApproval } from '../../extension/src/services/enterpriseai/internalApi/RecordArchitectureDecisionApproval';
import { requestArchitectureDecision } from '../../extension/src/services/enterpriseai/internalApi/RequestArchitectureDecision';
import { resolveEnterpriseAiReferences } from '../../extension/src/services/enterpriseai/internalApi/ResolveEnterpriseAiReferences';
import { runCompatibilityAndParityGate } from '../../extension/src/services/enterpriseai/internalApi/RunCompatibilityAndParityGate';
import { updateExtensionMessaging } from '../../extension/src/services/enterpriseai/internalApi/UpdateExtensionMessaging';
import { validateDeploymentReadiness } from '../../extension/src/services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { workflowActivateProfile } from '../../extension/src/services/enterpriseai/internalApi/WorkflowActivateProfile';

function createFixtureDir(prefix: string): string {
  return path.join(process.cwd(), 'tests', 'integration', `${prefix}-${process.pid}-${Date.now()}`);
}

function markCovered(
  contractId: EventContractId,
  payload: unknown,
  covered: Set<EventContractId>
): void {
  const schemaValidation = validateEventPayload(contractId, payload);
  expect(schemaValidation.valid).toBe(true);

  const compatibilityValidation = validateProducerConsumerEventPayloads(
    contractId,
    payload,
    payload
  );
  expect(compatibilityValidation.compatible).toBe(true);

  covered.add(contractId);
}

describe('enterpriseai event contract coverage gate (root integration)', () => {
  it('covers EVT-001 through EVT-012 payload + publish + consume + gate paths', async () => {
    const covered = new Set<EventContractId>();

    const fallbackFixtureDir = createFixtureDir('fixtures-event-fallback');
    const deploymentFixtureDir = createFixtureDir('fixtures-event-deployment');

    fs.rmSync(fallbackFixtureDir, { recursive: true, force: true });
    fs.rmSync(deploymentFixtureDir, { recursive: true, force: true });

    try {
      const fallbackDir = path.join(fallbackFixtureDir, '.specify', 'references', 'platform');
      const featureDir = path.join(
        fallbackFixtureDir,
        '.specify',
        'specs',
        '029-enterpriseai-student-vertical-builder'
      );
      fs.mkdirSync(fallbackDir, { recursive: true });
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(path.join(fallbackDir, 'eai.md'), '# eai cli fallback\n', 'utf8');
      fs.writeFileSync(
        path.join(fallbackDir, 'eai-app-template.md'),
        '# eai app template fallback\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(fallbackDir, 'deployment-repo.md'),
        '# deployment fallback\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'discovery.md'),
        '# Discovery\nEnterpriseAI business need and persona context.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'spec.md'),
        '# Spec\nEnterpriseAI solution overview for event coverage.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'plan.md'),
        '# Plan\nArchitecture and deployment sequencing for event coverage.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'implementation-summary.md'),
        '# Implementation\nExecution summary and measurable outcomes.\n',
        'utf8'
      );

      fs.mkdirSync(deploymentFixtureDir, { recursive: true });
      fs.writeFileSync(
        path.join(deploymentFixtureDir, 'eai.runtime.json'),
        '{"schemaVersion":1}\n',
        'utf8'
      );
      fs.mkdirSync(path.join(deploymentFixtureDir, '.eai'), { recursive: true });
      fs.writeFileSync(
        path.join(deploymentFixtureDir, '.eai', 'deploy-doctor.json'),
        '{"status":"pass"}\n',
        'utf8'
      );

      workflowActivateProfile(
        {
          runId: 'run_evt_001',
          workflowProfile: 'enterpriseai',
          stage: 'planning',
          requestedBy: 'student@university.edu',
        },
        {
          eventPublisher: (payload): void => markCovered('EVT-001', payload, covered),
        }
      );

      const decisionRequest = requestArchitectureDecision(
        {
          runId: 'run_evt_001',
          decisionId: 'evt-decision-01',
          title: 'Select deployment strategy',
          options: ['feature-flagged', 'strangler', 'big-bang'],
          requiresExplicitApproval: true,
        },
        {
          eventPublisher: (payload): void => markCovered('EVT-002', payload, covered),
        }
      );

      recordArchitectureDecisionApproval(
        {
          runId: 'run_evt_001',
          approvalToken: decisionRequest.response.approvalToken,
          decisionId: 'evt-decision-01',
          approved: true,
          approvedBy: 'student@university.edu',
        },
        {
          eventPublisher: (payload): void => markCovered('EVT-003', payload, covered),
        }
      );

      const fallbackNotices: string[] = [];
      const referenceHandlers = createReferenceFallbackEventHandlers((notice): void => {
        fallbackNotices.push(notice.message);
      });
      const referenceUnsubscribe = referenceHandlers.consume((payload): void => {
        markCovered('EVT-004', payload, covered);
      });

      await resolveEnterpriseAiReferences(
        {
          runId: 'run_evt_004',
          referenceTypes: ['eai', 'eai-app-template', 'deployment-repo'],
          externalReferencesEnabled: false,
          fallbackPath: '.specify/references/platform/',
        },
        {
          workspaceRoot: fallbackFixtureDir,
          eventPublisher: (payload): void => {
            referenceHandlers.publish(payload);
          },
        }
      );
      referenceUnsubscribe();
      expect(fallbackNotices.length).toBeGreaterThan(0);

      const researchHandlers = createResearchArtifactEventHandlers();
      const researchUnsubscribe = researchHandlers.consume((payload): void => {
        markCovered('EVT-005', payload, covered);
      });

      await generateBusinessAndMarketArtifacts(
        {
          runId: 'run_evt_005',
          workflowProfile: 'enterpriseai',
          includeCompetitiveAnalysis: true,
          minimumAlternativeCount: 3,
          requireSpecAndPlanReferences: true,
          discoveryArtifactPath:
            '.specify/specs/029-enterpriseai-student-vertical-builder/discovery.md',
          competitiveAlternatives: ['alt-1', 'alt-2', 'alt-3'],
        },
        {
          workspaceRoot: fallbackFixtureDir,
          eventPublisher: (payload): void => {
            researchHandlers.publish(payload);
          },
        }
      );
      researchUnsubscribe();

      generateEnterpriseAiPlanAndTasks(
        {
          runId: 'run_evt_006',
          workflowProfile: 'enterpriseai',
          specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
          resolvedReferences: {
            eaiCli: '.specify/references/platform/eai.md',
            eaiAppTemplate: '.specify/references/platform/eai-app-template.md',
            deploymentRepo: '.specify/references/platform/deployment-repo.md',
          },
          installedEaiCliVersion: '2.7.4',
        },
        {
          eventPublisher: (payload): void => markCovered('EVT-006', payload, covered),
        }
      );

      const stakeholderHandlers = createStakeholderCommsEventHandlers();
      const stakeholderUnsubscribe = stakeholderHandlers.consume((payload): void => {
        markCovered('EVT-007', payload, covered);
      });

      await generateStakeholderArtifacts(
        {
          runId: 'run_evt_007',
          workflowProfile: 'enterpriseai',
          enableMarpDeck: true,
          inputArtifacts: {
            discovery: '.specify/specs/029-enterpriseai-student-vertical-builder/discovery.md',
            spec: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
            plan: '.specify/specs/029-enterpriseai-student-vertical-builder/plan.md',
            implementationSummary:
              '.specify/specs/029-enterpriseai-student-vertical-builder/implementation-summary.md',
          },
        },
        {
          workspaceRoot: fallbackFixtureDir,
          eventPublisher: (payload): void => {
            stakeholderHandlers.publish(payload);
          },
        }
      );
      stakeholderUnsubscribe();

      const mirrorHandlers = createMirrorPropagationEventHandlers((payload): void => {
        expect(payload.runtimeSyncCompleted).toBe(true);
      });
      const mirrorUnsubscribe = mirrorHandlers.consume((payload): void => {
        markCovered('EVT-008', payload, covered);
      });

      await propagateCanonicalMirrors(
        {
          changeSetId: 'chg_evt_008',
          canonicalSources: ['.specify/commands/0_gofer_start.md'],
          targetMirrors: ['copilot', 'codex', 'antigravity', 'antigravity-desktop'],
          runParityValidation: true,
        },
        {
          workspaceRoot: process.cwd(),
          eventPublisher: (payload): void => {
            mirrorHandlers.publish(payload);
          },
        }
      );
      mirrorUnsubscribe();

      const positioningHandlers = createPositioningEventHandlers();
      const positioningUnsubscribe = positioningHandlers.consume((payload): void => {
        markCovered('EVT-009', payload, covered);
      });

      await updateExtensionMessaging(
        {
          releaseId: 'rel_evt_009',
          surfaces: ['README.md', 'extension/README.md', 'extension/package.json'],
          primaryMessage: 'EnterpriseAI-first app delivery',
          preserveMultiPlatformSection: true,
        },
        {
          workspaceRoot: process.cwd(),
          eventPublisher: (payload): void => {
            positioningHandlers.publish(payload, () => true);
          },
        }
      );
      positioningUnsubscribe();

      const compatibilityHandlers = createCompatibilityParityEventHandlers();
      const compatibilityUnsubscribe = compatibilityHandlers.consume((payload): void => {
        markCovered('EVT-010', payload, covered);
      });

      await runCompatibilityAndParityGate(
        {
          runId: 'run_evt_010',
          checks: ['parity', 'integration', 'routing'],
          requireZeroRegression: true,
          requireRemovalApprovalLog: false,
        },
        {
          eventPublisher: (payload): void => {
            compatibilityHandlers.publish(payload, () => ({
              releaseAllowed: true,
              reasons: [],
            }));
          },
        }
      );
      compatibilityUnsubscribe();

      const capabilityHandlers = createCapabilityRemovalEventHandlers();
      const capabilityUnsubscribe = capabilityHandlers.consume((): boolean => true);
      const capabilityPayload = {
        eventId: 'evt_011_coverage',
        changeSetId: 'chg_evt_011',
        affectedCapability: 'provider-routing-codex',
        requiresExplicitApproval: true,
        blocking: true,
      };
      markCovered('EVT-011', capabilityPayload, covered);
      capabilityHandlers.publish(capabilityPayload, () => true);
      capabilityUnsubscribe();

      const deploymentHandlers = createDeploymentReadinessEventHandlers();
      const deploymentUnsubscribe = deploymentHandlers.consume((payload): void => {
        markCovered('EVT-012', payload, covered);
      });

      await validateDeploymentReadiness(
        {
          runId: 'run_evt_012',
          stage: 'implementation',
          deploymentTaskId: 'task_evt_012',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        {
          workspaceRoot: deploymentFixtureDir,
          eventPublisher: (payload): void => {
            deploymentHandlers.publish(payload);
          },
        }
      );
      deploymentUnsubscribe();

      expect(Array.from(covered).sort()).toEqual([...EVENT_PAYLOAD_CONTRACT_IDS].sort());
    } finally {
      fs.rmSync(fallbackFixtureDir, { recursive: true, force: true });
      fs.rmSync(deploymentFixtureDir, { recursive: true, force: true });
    }
  });
});
