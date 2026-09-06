import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import manifest from '../../../extension/package.json';
import { ConfigManager } from '../../../extension/src/config';
import {
  RUNTIME_SURFACES,
  parseRuntimeSurfacePreference,
} from '../../../extension/src/config/runtimeSurface';
import { validateInternalApiPayload } from '../../../extension/src/services/enterpriseai/contracts/InternalApiSchemas';
import { validateEventPayload } from '../../../extension/src/services/enterpriseai/contracts/EventPayloadSchemas';
import { TARGET_PLATFORMS } from '../../../extension/src/services/enterpriseai/models/Propagation';

describe('Runtime surface contracts', () => {
  it('exposes both Antigravity surfaces without a Gemini CLI choice', () => {
    for (const key of ['gofer.defaultCLI', 'gofer.cliProvider'] as const) {
      const setting = manifest.contributes.configuration.properties[key];
      expect(new Set(setting.enum)).toEqual(new Set([...RUNTIME_SURFACES, 'auto']));
      expect(setting.enumDescriptions).toHaveLength(setting.enum.length);
    }
    expect(TARGET_PLATFORMS).toEqual(RUNTIME_SURFACES);
  });

  it.each(['gemini', 'gemini-cli'])(
    'rejects saved %s settings without rewriting them',
    (legacy) => {
      const update = vi.fn();
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: () => legacy,
        update,
      } as unknown as vscode.WorkspaceConfiguration);
      const config = ConfigManager.getInstance();
      config.refresh();
      expect(() => config.getDefaultCLI()).toThrow('Gemini CLI is retired');
      expect(() => config.getPreferredCLIProvider()).toThrow('Gemini CLI is retired');
      expect(update).not.toHaveBeenCalled();
    }
  );

  it.each(RUNTIME_SURFACES)('retains exact explicit surface %s', (surface) => {
    expect(parseRuntimeSurfacePreference(surface)).toBe(surface);
  });

  it.each(['gemini', 'gemini-cli', '.gemini/commands/gofer', '.gemini\\commands\\gofer'])(
    'rejects legacy mirror target %s in request and event contracts',
    (legacy) => {
      expect(
        validateInternalApiPayload('IAP-008', {
          changeSetId: 'change',
          canonicalSources: ['.specify/commands/0_gofer_start.md'],
          targetMirrors: [legacy],
          runParityValidation: true,
        })
      ).toMatchObject({ valid: false, errors: [expect.stringContaining('retired')] });
      expect(
        validateEventPayload('EVT-008', {
          eventId: 'event',
          changeSetId: 'change',
          mirrors: [legacy],
          filesChanged: 1,
          runtimeSyncCompleted: true,
        })
      ).toMatchObject({ valid: false, errors: [expect.stringContaining('retired')] });
    }
  );

  it('accepts CLI and desktop as distinct internal request and event targets', () => {
    const surfaces = ['antigravity', 'antigravity-desktop'];
    expect(
      validateInternalApiPayload('IAP-008', {
        changeSetId: 'change',
        canonicalSources: ['.specify/commands/0_gofer_start.md'],
        targetMirrors: surfaces,
        runParityValidation: true,
      }).valid
    ).toBe(true);
    expect(
      validateEventPayload('EVT-008', {
        eventId: 'event',
        changeSetId: 'change',
        mirrors: surfaces,
        filesChanged: 2,
        runtimeSyncCompleted: true,
      }).valid
    ).toBe(true);
  });
});
