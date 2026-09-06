import * as vscode from 'vscode';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import type { CLIModelCatalogResolver } from '../../types';
import type * as DiscoveryModule from '../../../../../.specify/scripts/node/lib/model-discovery.mjs';

type LiveDiscovery = Pick<typeof DiscoveryModule, 'discoverModels'>;

async function loadBundledDiscovery(): Promise<LiveDiscovery> {
  const extensionPath = vscode.extensions.getExtension('EnterpriseAI.gofer')?.extensionPath;
  if (!extensionPath) {
    throw new Error('Bundled model discovery unavailable');
  }
  const resource = pathToFileURL(
    path.join(extensionPath, 'resources', 'node-scripts', 'lib', 'model-discovery.mjs')
  );
  // Load only the installed extension's trusted resource, never workspace-supplied code.
  return import(/* webpackIgnore: true */ resource.href);
}

/** Only the CLI catalog is used here; this does not establish desktop model availability. */
export function createCLIModelCatalogResolver(
  loadDiscovery: () => Promise<LiveDiscovery> = loadBundledDiscovery
): CLIModelCatalogResolver {
  return async ({ providerId, cliCommand, requestedModelId, signal }) => {
    // Claude has no verified live metadata adapter here. Never infer its available models.
    if (providerId !== 'codex-cli' || signal.aborted) {
      return null;
    }
    try {
      const discovery = await loadDiscovery();
      if (signal.aborted) {
        return null;
      }
      const result = await discovery.discoverModels(
        {
          host: 'codex',
          surface: 'cli',
          expectedAuthMode: 'chatgpt',
          requestedModelId,
          readConfig: true,
          timeoutMs: 4000,
        },
        {
          // Match inference's exact executable and inherited cwd/environment. No shell or auth switch.
          invocation: () => ({ command: cliCommand, args: ['app-server', '--stdio'] }),
          spawnProcess: (command, args, options) => spawn(command, args, { ...options, signal }),
        }
      );
      if (
        signal.aborted ||
        result.status !== 'advertised' ||
        result.host !== 'codex' ||
        result.surface !== 'cli' ||
        result.profile !== null ||
        result.authMode !== 'chatgpt' ||
        result.source?.kind !== 'codex-app-server' ||
        result.source.accountScoped !== true ||
        result.accountBinding !== 'live-probe' ||
        typeof result.authContextId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(result.authContextId) ||
        result.configurationRead !== true ||
        result.check?.modelId !== requestedModelId ||
        result.check.selectedFrom !== 'requested' ||
        result.check.modelAdvertised !== true ||
        result.check.reasoningAdvertised === false ||
        result.observedAtMs === null
      ) {
        return null;
      }
      // A model-only launch retains configured reasoning, even when changing models.
      const inheritedEffort = result.configuredReasoningEffort;
      if (
        inheritedEffort !== null &&
        (typeof inheritedEffort !== 'string' ||
          inheritedEffort.length === 0 ||
          result.check.reasoningEffort !== inheritedEffort ||
          result.check.reasoningAdvertised !== true ||
          !result.models
            .find((model) => model.id === requestedModelId)
            ?.reasoningEfforts?.includes(inheritedEffort))
      ) {
        return null;
      }
      return {
        providerId,
        cliCommand,
        source: 'live',
        accountScoped: true,
        observedAtMs: result.observedAtMs,
        availableModelIds: result.models.map((model) => model.id),
      };
    } catch {
      // The caller supplies the actionable error; raw protocol/account output remains private.
      return null;
    }
  };
}

export const discoverCLIModels = createCLIModelCatalogResolver();
