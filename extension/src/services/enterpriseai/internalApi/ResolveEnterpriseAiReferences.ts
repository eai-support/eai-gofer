import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';

export type EnterpriseAiReferenceType = 'eai' | 'eai-app-template' | 'deployment-repo';
export type EnterpriseAiReferenceSource = 'external' | 'local-fallback';

export interface ResolveEnterpriseAiReferencesRequest {
  runId: string;
  referenceTypes: readonly string[];
  externalReferencesEnabled: boolean;
  fallbackPath: string;
}

export interface ResolvedEnterpriseAiReference {
  type: EnterpriseAiReferenceType;
  source: EnterpriseAiReferenceSource;
  path: string;
}

export interface ResolveEnterpriseAiReferencesResponse {
  status: 'resolved';
  resolvedReferences: readonly ResolvedEnterpriseAiReference[];
  unavailableExternalReferences: readonly EnterpriseAiReferenceType[];
  userNoticeRequired: boolean;
}

export interface ReferenceFallbackUsedEventPayload {
  eventId: string;
  runId: string;
  fallbackPath: string;
  unavailableExternalReferences: readonly string[];
  userNoticeRequired: boolean;
}

export interface ResolveEnterpriseAiReferencesEvent {
  contractId: 'EVT-004';
  eventName: 'references.eai-fallback.used.v1';
  payload: ReferenceFallbackUsedEventPayload;
}

export interface ResolveEnterpriseAiReferencesResult {
  contractId: 'IAP-004';
  operationName: 'references.resolveEnterpriseAiReferences';
  response: ResolveEnterpriseAiReferencesResponse;
  emittedEvent?: ResolveEnterpriseAiReferencesEvent;
}

export type ExternalReferenceResolver = (
  referenceType: EnterpriseAiReferenceType
) => string | undefined;
export type ExternalReferenceAvailabilityChecker = (
  externalReferencePath: string,
  referenceType: EnterpriseAiReferenceType
) => Promise<boolean>;

export interface ResolveEnterpriseAiReferencesOptions {
  eventId?: string;
  resolvedAt?: string;
  workspaceRoot?: string;
  externalReferenceResolver?: ExternalReferenceResolver;
  externalReferenceAvailabilityChecker?: ExternalReferenceAvailabilityChecker;
  eventPublisher?: (payload: ReferenceFallbackUsedEventPayload) => void;
}

const DEFAULT_FALLBACK_PATH = '.specify/references/platform/';
const LEGACY_EAI_REFERENCE_NAME = ['eai', 'cli'].join('-');
const LEGACY_EAI_REFERENCE_DOCS = `${LEGACY_EAI_REFERENCE_NAME}-docs`;
const LEGACY_EAI_REFERENCE_DOCS_UNDERSCORE = ['eai', 'cli', 'docs'].join('_');

const REFERENCE_FILE_NAMES: Readonly<Record<EnterpriseAiReferenceType, string>> = {
  eai: 'eai.md',
  'eai-app-template': 'eai-app-template.md',
  'deployment-repo': 'deployment-repo.md',
};

const REFERENCE_TYPE_ALIASES: Readonly<Record<string, EnterpriseAiReferenceType>> = {
  eai: 'eai',
  'eai-docs': 'eai',
  eai_docs: 'eai',
  [LEGACY_EAI_REFERENCE_NAME]: 'eai',
  [LEGACY_EAI_REFERENCE_DOCS]: 'eai',
  [LEGACY_EAI_REFERENCE_DOCS_UNDERSCORE]: 'eai',
  'vertical-template': 'eai-app-template',
  vertical_template: 'eai-app-template',
  'vertical-template-docs': 'eai-app-template',
  eai_app_template_docs: 'eai-app-template',
  'eai-app-template': 'eai-app-template',
  'eai-app-template-docs': 'eai-app-template',
  deployment_repo_docs: 'deployment-repo',
  'deployment-repo': 'deployment-repo',
  'deployment-repo-docs': 'deployment-repo',
};

const EXTERNAL_REFERENCE_PROBE_TIMEOUT_MS = 5000;

interface FetchLikeResponse {
  ok: boolean;
  status: number;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    signal?: AbortSignal;
  }
) => Promise<FetchLikeResponse>;

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function normalizeFallbackPath(fallbackPath: string): string {
  const normalized = path.posix.normalize(fallbackPath.trim().replace(/\\/g, '/'));
  if (normalized === '.') {
    return DEFAULT_FALLBACK_PATH;
  }

  if (!normalized.endsWith('/')) {
    return `${normalized}/`;
  }

  return normalized;
}

function assertSupportedFallbackPath(fallbackPath: string): void {
  if (path.isAbsolute(fallbackPath)) {
    throw new Error(
      `REF_FALLBACK_NOT_FOUND: fallbackPath must be workspace-relative under ${DEFAULT_FALLBACK_PATH}.`
    );
  }

  const normalizedWithoutTrailingSlash = fallbackPath.endsWith('/')
    ? fallbackPath.slice(0, -1)
    : fallbackPath;
  const allowedRoot = DEFAULT_FALLBACK_PATH.endsWith('/')
    ? DEFAULT_FALLBACK_PATH.slice(0, -1)
    : DEFAULT_FALLBACK_PATH;

  if (
    normalizedWithoutTrailingSlash === '..' ||
    normalizedWithoutTrailingSlash.startsWith('../') ||
    normalizedWithoutTrailingSlash.includes('/../')
  ) {
    throw new Error(
      `REF_FALLBACK_NOT_FOUND: fallbackPath must stay within ${DEFAULT_FALLBACK_PATH}. Received: ${fallbackPath}`
    );
  }

  if (
    normalizedWithoutTrailingSlash !== allowedRoot &&
    !normalizedWithoutTrailingSlash.startsWith(`${allowedRoot}/`)
  ) {
    throw new Error(
      `REF_FALLBACK_NOT_FOUND: fallbackPath must be under ${DEFAULT_FALLBACK_PATH}. Received: ${fallbackPath}`
    );
  }
}

function normalizeReferenceType(referenceType: string): EnterpriseAiReferenceType {
  const normalized = referenceType.trim().toLowerCase();
  const alias = REFERENCE_TYPE_ALIASES[normalized];
  if (!alias) {
    throw new Error(`REF_EXTERNAL_UNAVAILABLE: unsupported reference type "${referenceType}".`);
  }

  return alias;
}

function resolveAbsolutePath(workspaceRoot: string, targetPath: string): string {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedTargetPath = path.resolve(resolvedWorkspaceRoot, targetPath);
  const relativeToWorkspace = path.relative(resolvedWorkspaceRoot, resolvedTargetPath);
  if (
    relativeToWorkspace.startsWith('..') ||
    relativeToWorkspace.includes(`..${path.sep}`) ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    throw new Error(
      `REF_FALLBACK_NOT_FOUND: fallback reference path must resolve inside workspace. Received: ${targetPath}`
    );
  }

  return resolvedTargetPath;
}

function buildFallbackReferencePaths(
  fallbackPath: string,
  referenceType: EnterpriseAiReferenceType
): readonly string[] {
  const paths = [path.posix.join(fallbackPath, REFERENCE_FILE_NAMES[referenceType])];

  if (referenceType === 'eai') {
    paths.push(path.posix.join(fallbackPath, `${LEGACY_EAI_REFERENCE_NAME}.md`));
  }

  if (referenceType === 'eai-app-template') {
    paths.push(path.posix.join(fallbackPath, 'vertical-template.md'));
  }

  return paths;
}

async function resolveFirstExistingFallbackPath(
  workspaceRoot: string,
  fallbackReferencePaths: readonly string[]
): Promise<string | undefined> {
  for (const fallbackReferencePath of fallbackReferencePaths) {
    const absoluteFallbackReferencePath = resolveAbsolutePath(workspaceRoot, fallbackReferencePath);
    if (await pathExists(absoluteFallbackReferencePath)) {
      return fallbackReferencePath;
    }
  }

  return undefined;
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (
      isNodeErrorWithCode(error) &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES')
    ) {
      return false;
    }
    throw error;
  }
}

function isHttpReference(externalReferencePath: string): boolean {
  return (
    externalReferencePath.startsWith('https://') || externalReferencePath.startsWith('http://')
  );
}

async function probeExternalReferenceAvailability(externalReferencePath: string): Promise<boolean> {
  if (!isHttpReference(externalReferencePath)) {
    return false;
  }

  const fetchLike = globalThis.fetch as FetchLike | undefined;
  if (!fetchLike) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_REFERENCE_PROBE_TIMEOUT_MS);

  try {
    const headResponse = await fetchLike(externalReferencePath, {
      method: 'HEAD',
      signal: controller.signal,
    });
    if (headResponse.ok) {
      return true;
    }

    if (headResponse.status === 405 || headResponse.status === 501) {
      const getResponse = await fetchLike(externalReferencePath, {
        method: 'GET',
        signal: controller.signal,
      });
      return getResponse.ok;
    }

    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isExternalReferenceAvailable(
  externalReferencePath: string,
  referenceType: EnterpriseAiReferenceType,
  availabilityChecker?: ExternalReferenceAvailabilityChecker
): Promise<boolean> {
  if (availabilityChecker) {
    try {
      return await availabilityChecker(externalReferencePath, referenceType);
    } catch {
      return false;
    }
  }

  return probeExternalReferenceAvailability(externalReferencePath);
}

function assertValidInternalApiPayload(payload: ResolveEnterpriseAiReferencesRequest): void {
  const validation = validateInternalApiPayload('IAP-004', payload);
  if (!validation.valid) {
    throw new Error(`IAP-004 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: ReferenceFallbackUsedEventPayload): void {
  const validation = validateEventPayload('EVT-004', payload);
  if (!validation.valid) {
    throw new Error(`EVT-004 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

export async function resolveEnterpriseAiReferences(
  request: ResolveEnterpriseAiReferencesRequest,
  options: ResolveEnterpriseAiReferencesOptions = {}
): Promise<ResolveEnterpriseAiReferencesResult> {
  assertValidInternalApiPayload(request);

  const fallbackPath = normalizeFallbackPath(request.fallbackPath);
  assertSupportedFallbackPath(fallbackPath);

  const normalizedReferenceTypes = Array.from(
    new Set(
      request.referenceTypes.map(
        (referenceType: string): EnterpriseAiReferenceType => normalizeReferenceType(referenceType)
      )
    )
  );
  if (normalizedReferenceTypes.length < 1) {
    throw new Error(
      'REF_ALL_SOURCES_UNAVAILABLE: at least one reference type is required to resolve references.'
    );
  }

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const resolvedReferences: ResolvedEnterpriseAiReference[] = [];
  const unavailableExternalReferences: EnterpriseAiReferenceType[] = [];
  const missingFallbackReferences: EnterpriseAiReferenceType[] = [];

  for (const referenceType of normalizedReferenceTypes) {
    const externalReferencePath = request.externalReferencesEnabled
      ? options.externalReferenceResolver?.(referenceType)?.trim()
      : undefined;
    if (externalReferencePath) {
      const externalReferenceAvailable = await isExternalReferenceAvailable(
        externalReferencePath,
        referenceType,
        options.externalReferenceAvailabilityChecker
      );
      if (externalReferenceAvailable) {
        resolvedReferences.push({
          type: referenceType,
          source: 'external',
          path: externalReferencePath,
        });
        continue;
      }
    }

    unavailableExternalReferences.push(referenceType);
    const fallbackReferencePath = await resolveFirstExistingFallbackPath(
      workspaceRoot,
      buildFallbackReferencePaths(fallbackPath, referenceType)
    );
    if (!fallbackReferencePath) {
      missingFallbackReferences.push(referenceType);
      continue;
    }

    resolvedReferences.push({
      type: referenceType,
      source: 'local-fallback',
      path: fallbackReferencePath,
    });
  }

  if (missingFallbackReferences.length > 0) {
    throw new Error(
      `REF_FALLBACK_NOT_FOUND: missing local fallback references for ${missingFallbackReferences.join(
        ', '
      )} under ${fallbackPath}`
    );
  }

  if (resolvedReferences.length < 1) {
    throw new Error(
      'REF_ALL_SOURCES_UNAVAILABLE: neither external nor local fallback references are available.'
    );
  }

  const userNoticeRequired = unavailableExternalReferences.length > 0;
  const response: ResolveEnterpriseAiReferencesResponse = {
    status: 'resolved',
    resolvedReferences,
    unavailableExternalReferences,
    userNoticeRequired,
  };

  let emittedEvent: ResolveEnterpriseAiReferencesEvent | undefined;
  if (userNoticeRequired) {
    const resolvedAt = options.resolvedAt ?? toIsoTimestamp();
    const eventPayload: ReferenceFallbackUsedEventPayload = {
      eventId: options.eventId ?? buildEventId('evt_004', resolvedAt),
      runId: request.runId,
      fallbackPath,
      unavailableExternalReferences,
      userNoticeRequired: true,
    };
    assertValidEventPayload(eventPayload);
    options.eventPublisher?.(eventPayload);

    emittedEvent = {
      contractId: 'EVT-004',
      eventName: 'references.eai-fallback.used.v1',
      payload: eventPayload,
    };
  }

  return {
    contractId: 'IAP-004',
    operationName: 'references.resolveEnterpriseAiReferences',
    response,
    emittedEvent,
  };
}
