import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import * as vscode from 'vscode';
import { Logger } from '../../../extension/src/services/Logger';
import {
  UpgradeService,
  type IResourceOperations,
} from '../../../extension/src/services/migration/UpgradeService';
import type { VersionDetector } from '../../../extension/src/services/migration/VersionDetector';

function createResourceOperations(): {
  operations: IResourceOperations;
  setupGrokSkills: ReturnType<typeof vi.fn>;
  setupDefaultInstructions: ReturnType<typeof vi.fn>;
  writeGoferVersion: ReturnType<typeof vi.fn>;
} {
  const noOp = vi.fn().mockResolvedValue(undefined);
  const setupGrokSkills = vi.fn().mockResolvedValue(undefined);
  const setupDefaultInstructions = vi.fn().mockResolvedValue(undefined);
  const writeGoferVersion = vi.fn().mockResolvedValue(undefined);
  const operations = new Proxy(
    { setupGrokSkills, setupDefaultInstructions, writeGoferVersion },
    {
      get(target, property) {
        return target[property as keyof typeof target] ?? noOp;
      },
    }
  ) as unknown as IResourceOperations;

  return { operations, setupGrokSkills, setupDefaultInstructions, writeGoferVersion };
}

describe('UpgradeService current AI surface orchestration', () => {
  let service: UpgradeService;

  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.window as unknown as { withProgress: ReturnType<typeof vi.fn> }).withProgress = vi.fn(
      async (_options, callback) =>
        callback(
          { report: vi.fn() } as unknown as vscode.Progress<{
            message?: string;
            increment?: number;
          }>,
          { isCancellationRequested: false, onCancellationRequested: vi.fn() }
        )
    );
    const versionDetector = {
      detectFormat: vi.fn().mockResolvedValue('none'),
      getVersionInfo: vi.fn().mockResolvedValue({
        format: 'none',
        needsUpgrade: true,
        details: 'not initialized',
      }),
    } as unknown as VersionDetector;
    service = new UpgradeService(new Logger(), versionDetector);
  });

  it('provisions Grok skills and required instructions during a fresh VSIX initialization', async () => {
    const { operations, setupGrokSkills, setupDefaultInstructions, writeGoferVersion } =
      createResourceOperations();

    await service.upgrade('/workspace', operations, { skipConfirmation: true });

    expect(setupGrokSkills).toHaveBeenCalledOnce();
    expect(setupDefaultInstructions).toHaveBeenCalledOnce();
    expect(setupGrokSkills.mock.invocationCallOrder[0]).toBeLessThan(
      setupDefaultInstructions.mock.invocationCallOrder[0]
    );
    expect(writeGoferVersion).toHaveBeenCalledOnce();
    expect(setupDefaultInstructions.mock.invocationCallOrder[0]).toBeLessThan(
      writeGoferVersion.mock.invocationCallOrder[0]
    );
  });

  it('provisions the same surfaces during an existing-workspace template update', async () => {
    const { operations, setupGrokSkills, setupDefaultInstructions, writeGoferVersion } =
      createResourceOperations();

    await service.updateGoferTemplates('/workspace', operations, true);

    expect(setupGrokSkills).toHaveBeenCalledOnce();
    expect(setupDefaultInstructions).toHaveBeenCalledOnce();
    expect(writeGoferVersion).toHaveBeenCalledOnce();
  });

  it('rejects an initialization when a required instruction cannot be written', async () => {
    const { operations, setupDefaultInstructions, writeGoferVersion } = createResourceOperations();
    setupDefaultInstructions.mockRejectedValueOnce(new Error('instruction write failed'));

    await expect(
      service.upgrade('/workspace', operations, { skipConfirmation: true })
    ).rejects.toThrow('instruction write failed');
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Upgrade complete')
    );
    expect(writeGoferVersion).not.toHaveBeenCalled();
  });
});
