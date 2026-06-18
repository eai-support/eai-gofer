import * as fs from 'fs/promises';
import * as path from 'path';
import { type EaiReferenceSource, type EaiReferenceType } from './enterpriseai/models/Governance';

export interface ResolvedEnterpriseAiReference {
  referenceType: EaiReferenceType;
  source: 'external' | 'local-fallback';
  path: string;
  externalSourceUrl?: string;
}

export interface FallbackNoticePayload {
  runId: string;
  fallbackPath: string;
  unavailableExternalReferences: readonly EaiReferenceType[];
  userNoticeRequired: boolean;
}

export interface EnterpriseAiReferenceResolutionResult {
  status: 'resolved' | 'failed';
  resolvedReferences: readonly ResolvedEnterpriseAiReference[];
  unavailableExternalReferences: readonly EaiReferenceType[];
  userNoticeRequired: boolean;
  fallbackNotice?: FallbackNoticePayload;
  errors: readonly string[];
}

export class EAIReferenceResolver {
  constructor(private readonly workspaceRoot: string = process.cwd()) {}

  public async resolve(
    runId: string,
    sources: readonly EaiReferenceSource[]
  ): Promise<EnterpriseAiReferenceResolutionResult> {
    const resolvedReferences: ResolvedEnterpriseAiReference[] = [];
    const unavailableExternalReferences: EaiReferenceType[] = [];
    const errors: string[] = [];

    for (const source of sources) {
      if (source.availabilityStatus === 'external_available' && source.externalSourceUrl) {
        resolvedReferences.push({
          referenceType: source.referenceType,
          source: 'external',
          path: source.externalSourceUrl,
          externalSourceUrl: source.externalSourceUrl,
        });
        continue;
      }

      unavailableExternalReferences.push(source.referenceType);
      const absoluteFallbackPath = this.resolveFallbackPath(source.localFallbackPath);
      const fallbackExists = await this.pathExists(absoluteFallbackPath);

      if (!fallbackExists) {
        errors.push(
          `Fallback reference missing for ${source.referenceType}: ${source.localFallbackPath}`
        );
        continue;
      }

      resolvedReferences.push({
        referenceType: source.referenceType,
        source: 'local-fallback',
        path: source.localFallbackPath,
      });
    }

    const userNoticeRequired = unavailableExternalReferences.length > 0;
    const fallbackNotice = userNoticeRequired
      ? {
          runId,
          fallbackPath: '.specify/references/platform/',
          unavailableExternalReferences,
          userNoticeRequired: true,
        }
      : undefined;

    return {
      status: errors.length > 0 ? 'failed' : 'resolved',
      resolvedReferences,
      unavailableExternalReferences,
      userNoticeRequired,
      fallbackNotice,
      errors,
    };
  }

  private resolveFallbackPath(localFallbackPath: string): string {
    const resolvedWorkspaceRoot = path.resolve(this.workspaceRoot);
    const resolvedPath = path.isAbsolute(localFallbackPath)
      ? path.resolve(localFallbackPath)
      : path.resolve(resolvedWorkspaceRoot, localFallbackPath);
    const relativePath = path.relative(resolvedWorkspaceRoot, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(
        `Fallback reference path must resolve within workspace root: ${localFallbackPath}`
      );
    }

    return resolvedPath;
  }

  private isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch (error) {
      if (
        this.isNodeErrorWithCode(error) &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return false;
      }

      if (error instanceof Error) {
        throw new Error(`Unable to access fallback reference path ${targetPath}: ${error.message}`, {
          cause: error,
        });
      }
      throw new Error(`Unable to access fallback reference path ${targetPath}.`, {
        cause: error,
      });
    }
  }
}
