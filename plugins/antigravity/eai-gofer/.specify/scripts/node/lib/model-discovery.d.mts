import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';

export type Surface = 'cli' | 'desktop' | 'ide' | 'vscode-extension';
export type AuthMode = 'chatgpt' | 'apiKey' | 'subscription' | 'local' | 'loggedOut' | 'unknown';
export interface AdvertisedModel {
  /** Exact selectable identifier: Codex native Model.model, not its UI Model.id.
   * Other native adapters likewise normalize their selectable identifiers here. */
  id: string;
  isDefault: boolean;
  reasoningEfforts: string[] | null;
  defaultReasoningEffort: string | null;
}
/** Supplied by the trusted native adapter for this surface and current account.
 * accountScoped/source are assertions, not cryptographic proof or live inference.
 * Omit raw account/configuration objects and all credentials.
 */
export interface CatalogSnapshot {
  source: { kind: 'native-catalog' | 'codex-app-server'; ref: string; accountScoped: true };
  host: string;
  surface: Surface;
  profile?: string | null;
  authMode: AuthMode;
  /** Non-secret opaque context issued by the native adapter; never an email/token. */
  authContextId: string;
  observedAtMs: number;
  models: AdvertisedModel[];
  configurationRead?: boolean;
  configuredModelId?: string | null;
  /** Explicit null means no configured override; omission means unknown.
   * A configured effort is inherited even when the requested model changes. */
  configuredReasoningEffort?: string | null;
}
export interface DiscoveryOptions {
  host: string;
  surface?: Surface;
  profile?: string;
  /** Codex defaults to chatgpt. API-key access must be requested explicitly. */
  expectedAuthMode?: Exclude<AuthMode, 'loggedOut' | 'unknown'>;
  /** Required for supplied snapshots. Caller asserts its current account context.
   * Not accepted for live discovery; live context IDs are per-probe, not fingerprints. */
  expectedAuthContextId?: string;
  requestedModelId?: string;
  /** An explicit override that the execution bridge will actually apply. */
  requestedReasoningEffort?: string;
  nowMs?: number;
  maxAgeMs?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Defaults true; keep true in the execution bridge. False cannot verify inherited effort. */
  readConfig?: boolean;
  snapshot?: CatalogSnapshot | null;
}
export interface DiscoveryResult {
  status: 'advertised' | 'unavailable' | 'invalid';
  reason: string;
  host: string | null;
  surface: Surface | null;
  profile: string | null;
  source: CatalogSnapshot['source'] | null;
  authMode: AuthMode | null;
  authContextId: string | null;
  accountBinding: 'live-probe' | 'caller-asserted' | null;
  observedAtMs: number | null;
  models: AdvertisedModel[];
  defaultModelId: string | null;
  configurationRead: boolean;
  configuredModelId: string | null;
  configuredModelAdvertised: boolean | null;
  configuredReasoningEffort: string | null;
  check: {
    modelId: string | null;
    selectedFrom: 'requested' | 'configured' | 'host-default' | 'none';
    modelAdvertised: boolean | null;
    /** Only an advertised effort is retained; unknown/unsupported values are null. */
    reasoningEffort: string | null;
    reasoningAdvertised: boolean | null;
  } | null;
  executionVerified: false;
  guidance: string;
}
export interface Invocation { command: string; args: string[] }
/** Trusted test/host dependency injection only, never accepted from CLI/snapshot JSON. */
export interface DiscoveryAdapters {
  now?: () => number;
  invocation?: (profile?: string) => Invocation;
  spawnProcess?: (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  terminate?: (child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) => void;
}
export function codexInvocation(profile?: string, environment?: {
  platform?: string;
  env?: Record<string, string | undefined>;
  exists?: (file: string) => boolean;
  node?: string;
}): Invocation;
export function checkModelCatalog(snapshot: unknown, options: DiscoveryOptions & { nowMs: number }): DiscoveryResult;
export function discoverModels(options: DiscoveryOptions, adapters?: DiscoveryAdapters): Promise<DiscoveryResult>;
