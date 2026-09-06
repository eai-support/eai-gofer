import { HOST_DEFAULT_MODEL, type CLIModelCatalogResolver, type CLIProviderId } from '../../types';
import { ProviderError, ProviderErrorCode } from '../ProviderError';

const DISCOVERY_TIMEOUT_MS = 5000;

/** Recheck before every launch, including retries; never silently substitute another model. */
export async function assertCLIModelOverride(
  providerId: CLIProviderId,
  cliCommand: string,
  model: string | undefined,
  discoverModels?: CLIModelCatalogResolver
): Promise<void> {
  if (model === undefined) {
    return;
  }
  if (
    typeof model !== 'string' ||
    !model ||
    model.length > 512 ||
    /[\s\p{Cc}]/u.test(model) ||
    model.startsWith('-') ||
    model === HOST_DEFAULT_MODEL
  ) {
    throw new ProviderError(
      'Invalid explicit CLI model override.',
      ProviderErrorCode.INVALID_REQUEST,
      providerId
    );
  }
  const unavailable = (): ProviderError =>
    new ProviderError(
      'Cannot verify the requested model against the current CLI account. Use the host default or retry live model discovery.',
      ProviderErrorCode.NOT_CONFIGURED,
      providerId
    );
  if (!discoverModels) {
    throw unavailable();
  }

  const startedAtMs = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let catalog;
  try {
    catalog = await Promise.race([
      Promise.resolve().then(() =>
        discoverModels({
          providerId,
          cliCommand,
          requestedModelId: model,
          signal: controller.signal,
        })
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(unavailable()), DISCOVERY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Discovery errors may contain account details or credentials; never forward them.
    throw unavailable();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  if (
    !catalog ||
    catalog.providerId !== providerId ||
    catalog.cliCommand !== cliCommand ||
    catalog.source !== 'live' ||
    catalog.accountScoped !== true ||
    !Number.isSafeInteger(catalog.observedAtMs) ||
    catalog.observedAtMs < startedAtMs ||
    catalog.observedAtMs > Date.now() ||
    !Array.isArray(catalog.availableModelIds) ||
    !catalog.availableModelIds.every((id) => typeof id === 'string')
  ) {
    throw unavailable();
  }
  if (!catalog.availableModelIds.includes(model)) {
    throw new ProviderError(
      'The requested model is not available in the current CLI account. No alternate model was selected.',
      ProviderErrorCode.INVALID_REQUEST,
      providerId
    );
  }
}
