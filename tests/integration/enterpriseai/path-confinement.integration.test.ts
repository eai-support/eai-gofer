import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { propagateCanonicalMirrors } from '../../../extension/src/services/enterpriseai/internalApi/PropagateCanonicalMirrors';
import { updateExtensionMessaging } from '../../../extension/src/services/enterpriseai/internalApi/UpdateExtensionMessaging';

describe('enterpriseai path confinement protections (root integration)', () => {
  it('rejects absolute and out-of-workspace canonical/target paths for IAP-008', async () => {
    await expect(
      propagateCanonicalMirrors({
        changeSetId: 'chg_path_001',
        canonicalSources: [path.resolve(process.cwd(), '.specify/commands/0_gofer_start.md')],
        targetMirrors: ['copilot'],
        runParityValidation: false,
      })
    ).rejects.toThrow(/PROP_MIRROR_WRITE_FAILED/);

    await expect(
      propagateCanonicalMirrors({
        changeSetId: 'chg_path_002',
        canonicalSources: ['.specify/commands/0_gofer_start.md'],
        targetMirrors: [path.resolve(process.cwd(), '.github/prompts')],
        runParityValidation: false,
      })
    ).rejects.toThrow(/PROP_MIRROR_WRITE_FAILED/);

    await expect(
      propagateCanonicalMirrors({
        changeSetId: 'chg_path_003',
        canonicalSources: ['../outside.md'],
        targetMirrors: ['copilot'],
        runParityValidation: false,
      })
    ).rejects.toThrow(/PROP_MIRROR_WRITE_FAILED/);
  });

  it('rejects absolute and out-of-workspace surfaces for IAP-009', async () => {
    await expect(
      updateExtensionMessaging({
        releaseId: 'rel_path_001',
        surfaces: [path.resolve(process.cwd(), 'README.md')],
        primaryMessage: 'EnterpriseAI primary message',
        preserveMultiPlatformSection: true,
      })
    ).rejects.toThrow(/POS_SURFACE_NOT_FOUND/);

    await expect(
      updateExtensionMessaging({
        releaseId: 'rel_path_002',
        surfaces: ['../README.md'],
        primaryMessage: 'EnterpriseAI primary message',
        preserveMultiPlatformSection: true,
      })
    ).rejects.toThrow(/POS_SURFACE_NOT_FOUND/);
  });
});
