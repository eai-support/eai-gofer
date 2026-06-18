import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';

export interface UpdateExtensionMessagingRequest {
  releaseId: string;
  surfaces: readonly string[];
  primaryMessage: string;
  preserveMultiPlatformSection: boolean;
}

export interface UpdateExtensionMessagingResponse {
  status: 'completed';
  updatedSurfaces: number;
  enterpriseAiPrimaryMessaging: true;
  multiPlatformSupportRetained: boolean;
}

export interface PositioningUpdatedEventPayload {
  eventId: string;
  releaseId: string;
  updatedSurfaces: readonly string[];
  multiPlatformSupportRetained: boolean;
}

export interface UpdateExtensionMessagingEvent {
  contractId: 'EVT-009';
  eventName: 'positioning.enterpriseai-updated.v1';
  payload: PositioningUpdatedEventPayload;
}

export interface UpdateExtensionMessagingResult {
  contractId: 'IAP-009';
  operationName: 'positioning.updateExtensionMessaging';
  response: UpdateExtensionMessagingResponse;
  emittedEvent: UpdateExtensionMessagingEvent;
}

export interface UpdateExtensionMessagingOptions {
  eventId?: string;
  updatedAt?: string;
  workspaceRoot?: string;
  surfaceUpdater?: (surface: string, primaryMessage: string) => void;
  eventPublisher?: (payload: PositioningUpdatedEventPayload) => void;
}

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function normalizeSurfaces(surfaces: readonly string[]): readonly string[] {
  return Array.from(
    new Set(
      surfaces
        .map((surface: string): string => surface.trim())
        .filter((surface: string): boolean => surface.length > 0)
    )
  );
}

function resolveSurfacePath(workspaceRoot: string, surface: string): string {
  const normalizedSurface = surface.trim().replace(/\\/g, '/');
  if (path.isAbsolute(normalizedSurface)) {
    throw new Error(
      `POS_SURFACE_NOT_FOUND: surface paths must be workspace-relative. Received absolute path: ${surface}`
    );
  }

  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedSurfacePath = path.resolve(resolvedWorkspaceRoot, normalizedSurface);
  const relativeToWorkspace = path.relative(resolvedWorkspaceRoot, resolvedSurfacePath);
  if (
    relativeToWorkspace.startsWith('..') ||
    relativeToWorkspace.includes(`..${path.sep}`) ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    throw new Error(
      `POS_SURFACE_NOT_FOUND: surface paths must resolve within workspace root. Received: ${surface}`
    );
  }

  return resolvedSurfacePath;
}

function assertValidInternalApiPayload(payload: UpdateExtensionMessagingRequest): void {
  const validation = validateInternalApiPayload('IAP-009', payload);
  if (!validation.valid) {
    throw new Error(`IAP-009 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: PositioningUpdatedEventPayload): void {
  const validation = validateEventPayload('EVT-009', payload);
  if (!validation.valid) {
    throw new Error(`EVT-009 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertMessagingPolicy(
  request: UpdateExtensionMessagingRequest,
  surfaces: readonly string[]
): void {
  if (surfaces.length < 1) {
    throw new Error('POS_VALIDATION_FAILED: at least one messaging surface must be provided.');
  }

  if (!request.preserveMultiPlatformSection) {
    throw new Error('POS_VALIDATION_FAILED: multi-platform support language must be retained.');
  }
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function surfaceExists(surfacePath: string): Promise<boolean> {
  try {
    await fs.access(surfacePath);
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

async function assertSurfacesExist(
  workspaceRoot: string,
  surfaces: readonly string[]
): Promise<void> {
  const missingChecks = await Promise.all(
    surfaces.map(async (surface: string): Promise<string | null> => {
      const resolvedPath = resolveSurfacePath(workspaceRoot, surface);
      return (await surfaceExists(resolvedPath)) ? null : surface;
    })
  );
  const missingSurfaces = missingChecks.filter(
    (surface: string | null): surface is string => surface !== null
  );

  if (missingSurfaces.length > 0) {
    throw new Error(`POS_SURFACE_NOT_FOUND: ${missingSurfaces.join(', ')}`);
  }
}

export async function updateExtensionMessaging(
  request: UpdateExtensionMessagingRequest,
  options: UpdateExtensionMessagingOptions = {}
): Promise<UpdateExtensionMessagingResult> {
  assertValidInternalApiPayload(request);

  const surfaces = normalizeSurfaces(request.surfaces);
  assertMessagingPolicy(request, surfaces);

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  await assertSurfacesExist(workspaceRoot, surfaces);

  for (const surface of surfaces) {
    if (!options.surfaceUpdater) {
      continue;
    }

    try {
      options.surfaceUpdater(surface, request.primaryMessage);
    } catch (error) {
      throw new Error(
        `POS_UPDATE_WRITE_FAILED: failed to update ${surface}. ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  const response: UpdateExtensionMessagingResponse = {
    status: 'completed',
    updatedSurfaces: surfaces.length,
    enterpriseAiPrimaryMessaging: true,
    multiPlatformSupportRetained: request.preserveMultiPlatformSection,
  };

  const updatedAt = options.updatedAt ?? toIsoTimestamp();
  const eventPayload: PositioningUpdatedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_009', updatedAt),
    releaseId: request.releaseId,
    updatedSurfaces: surfaces,
    multiPlatformSupportRetained: request.preserveMultiPlatformSection,
  };
  assertValidEventPayload(eventPayload);

  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-009',
    operationName: 'positioning.updateExtensionMessaging',
    response,
    emittedEvent: {
      contractId: 'EVT-009',
      eventName: 'positioning.enterpriseai-updated.v1',
      payload: eventPayload,
    },
  };
}
