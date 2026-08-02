import { createHash } from 'node:crypto';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_ARTIFACT_MANIFEST_SCHEMA_VERSION,
  GOFER_EXPORT_BUNDLE_SCHEMA_VERSION,
  GOFER_HANDOFF_SCHEMA_VERSION,
  GOFER_PIPELINE_STAGES,
  GOFER_REQUIRED_ARTIFACT_KINDS_BY_STAGE,
  GOFER_SOURCE_MANIFEST_SCHEMA_VERSION,
  type CreateGoferExportBundleRequest,
  type GoferApprovalRecord,
  type GoferArtifactManifest,
  type GoferArtifactRecord,
  type GoferArtifactReference,
  type GoferExportBundle,
  type GoferExportOmission,
  type GoferHandoff,
  type GoferPortableFile,
  type GoferPortableFileInput,
  type GoferSourceDocument,
  type GoferSourceManifest,
} from './contracts.js';
import { createGoferAuditHistory } from './auditHistory.js';
import {
  assertPortableGoferScaffold,
  assertPortableOrDeclaredGoferFiles,
} from './portableScaffold.js';
import { validateGenerationReadiness } from './validators.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareArtifacts(left: GoferArtifactRecord, right: GoferArtifactRecord): number {
  return (
    compareText(left.path, right.path) ||
    left.version - right.version ||
    compareText(left.artifactId, right.artifactId)
  );
}

function compareApprovals(left: GoferApprovalRecord, right: GoferApprovalRecord): number {
  return (
    compareText(left.decidedAt, right.decidedAt) || compareText(left.approvalId, right.approvalId)
  );
}

function compareSources(left: GoferSourceDocument, right: GoferSourceDocument): number {
  return (
    compareText(left.originalPath, right.originalPath) || compareText(left.sourceId, right.sourceId)
  );
}

function compareOmissions(left: GoferExportOmission, right: GoferExportOmission): number {
  return compareText(left.path, right.path) || compareText(left.reasonCode, right.reasonCode);
}

function compareArtifactReferences(
  left: GoferArtifactReference,
  right: GoferArtifactReference
): number {
  return (
    compareText(left.artifactId, right.artifactId) ||
    left.version - right.version ||
    compareText(left.sha256, right.sha256)
  );
}

function canonicalArtifact(artifact: GoferArtifactRecord): GoferArtifactRecord {
  return {
    ...artifact,
    inputArtifacts: [...artifact.inputArtifacts].sort(compareArtifactReferences),
    sourceIds: [...artifact.sourceIds].sort(compareText),
  };
}

function canonicalApproval(approval: GoferApprovalRecord): GoferApprovalRecord {
  return {
    ...approval,
    artifactRefs: [...approval.artifactRefs].sort(compareArtifactReferences),
  };
}

function canonicalSource(source: GoferSourceDocument): GoferSourceDocument {
  return {
    ...source,
    extractedPaths: [...source.extractedPaths].sort(compareText),
    usedByArtifactIds: [...source.usedByArtifactIds].sort(compareText),
    scan: {
      ...source.scan,
      violations: [...source.scan.violations].sort(
        (left, right) =>
          compareText(left.ruleId, right.ruleId) || compareText(left.description, right.description)
      ),
    },
  };
}

function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, entry]) => [key, normalizeForJson(entry)])
    );
  }
  return value;
}

/** Produces stable JSON so equal approved inputs create byte-identical manifests. */
export function stringifyGoferManifest(value: unknown): string {
  return `${JSON.stringify(normalizeForJson(value), null, 2)}\n`;
}

function decodeFileContent(file: GoferPortableFileInput): Buffer {
  if (file.encoding === 'utf8') {
    return Buffer.from(file.content, 'utf8');
  }
  if (file.encoding !== 'base64') {
    throw new Error(`Unsupported encoding for ${file.path}.`);
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) {
    throw new Error(`File ${file.path} contains invalid base64 content.`);
  }
  return Buffer.from(file.content, 'base64');
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function contentAddressFile(file: GoferPortableFileInput): GoferPortableFile {
  const sha256 = createHash('sha256').update(decodeFileContent(file)).digest('hex');
  return { ...file, sha256 };
}

/** Rejects absolute paths, traversal, and content outside the portable `.specify` boundary. */
export function assertPortableGoferPath(path: string): void {
  if (
    !path.startsWith('.specify/') ||
    path.startsWith('/') ||
    path.includes('\\') ||
    hasControlCharacter(path) ||
    path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
  ) {
    throw new Error(`Gofer export path is unsafe or outside .specify: ${path}`);
  }
}

function assertUniquePaths(files: readonly GoferPortableFileInput[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    assertPortableGoferPath(file.path);
    if (seen.has(file.path)) {
      throw new Error(`Gofer export contains duplicate path: ${file.path}`);
    }
    seen.add(file.path);
  }
}

function artifactReference(artifact: GoferArtifactRecord): GoferArtifactReference {
  return {
    artifactId: artifact.artifactId,
    version: artifact.version,
    sha256: artifact.sha256,
  };
}

function latestArtifactsById(
  artifacts: readonly GoferArtifactRecord[]
): ReadonlyMap<string, GoferArtifactRecord> {
  const latest = new Map<string, GoferArtifactRecord>();
  for (const artifact of artifacts) {
    const existing = latest.get(artifact.artifactId);
    if (!existing || artifact.version > existing.version) {
      latest.set(artifact.artifactId, artifact);
    }
  }
  return latest;
}

function assertRequiredArtifacts(request: CreateGoferExportBundleRequest): void {
  const currentArtifacts = request.artifacts.filter(
    (artifact) => artifact.status === 'current' || artifact.status === 'approved'
  );
  for (const stageState of request.run.stages) {
    if (stageState.status !== 'approved') {
      continue;
    }
    for (const kind of GOFER_REQUIRED_ARTIFACT_KINDS_BY_STAGE[stageState.stage]) {
      if (
        !currentArtifacts.some(
          (artifact) =>
            stageState.artifactIds.includes(artifact.artifactId) &&
            artifact.stage === stageState.stage &&
            artifact.kind === kind
        )
      ) {
        throw new Error(
          `Approved stage ${stageState.stage} requires current artifact kind ${kind}.`
        );
      }
    }
  }
}

function assertRecordOwnership(request: CreateGoferExportBundleRequest): void {
  for (const artifact of request.artifacts) {
    if (artifact.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
      throw new Error(`Artifact ${artifact.artifactId} has an unsupported schemaVersion.`);
    }
    if (artifact.runId !== request.run.runId) {
      throw new Error(`Artifact ${artifact.artifactId} belongs to another run.`);
    }
  }
  for (const approval of request.approvals) {
    if (approval.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
      throw new Error(`Approval ${approval.approvalId} has an unsupported schemaVersion.`);
    }
    if (approval.runId !== request.run.runId) {
      throw new Error(`Approval ${approval.approvalId} belongs to another run.`);
    }
  }
  for (const source of request.sources) {
    if (source.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
      throw new Error(`Source ${source.sourceId} has an unsupported schemaVersion.`);
    }
    if (source.runId !== request.run.runId) {
      throw new Error(`Source ${source.sourceId} belongs to another run.`);
    }
  }
}

function assertArtifactFiles(
  request: CreateGoferExportBundleRequest,
  filesByPath: ReadonlyMap<string, GoferPortableFile>
): void {
  const featureRoot = `.specify/specs/${request.run.featureSlug}/`;
  for (const artifact of request.artifacts) {
    if (artifact.runId !== request.run.runId) {
      throw new Error(`Artifact ${artifact.artifactId} belongs to another run.`);
    }
    if (!artifact.path.startsWith(featureRoot)) {
      throw new Error(`Artifact ${artifact.artifactId} must be under ${featureRoot}`);
    }
    const file = filesByPath.get(artifact.path);
    if (!file) {
      throw new Error(`Artifact ${artifact.artifactId} is missing export file ${artifact.path}.`);
    }
    if (!SHA256_PATTERN.test(artifact.sha256) || file.sha256 !== artifact.sha256) {
      throw new Error(`Artifact ${artifact.artifactId} hash does not match ${artifact.path}.`);
    }
  }
}

function assertSourceFiles(
  request: CreateGoferExportBundleRequest,
  filesByPath: ReadonlyMap<string, GoferPortableFile>
): void {
  for (const source of request.sources) {
    if (source.runId !== request.run.runId) {
      throw new Error(`Source ${source.sourceId} belongs to another run.`);
    }
    if (!source.originalPath.startsWith('.specify/sources/originals/')) {
      throw new Error(
        `Source ${source.sourceId} originalPath must be under .specify/sources/originals/.`
      );
    }
    for (const extractedPath of source.extractedPaths) {
      if (!extractedPath.startsWith('.specify/sources/extracted/')) {
        throw new Error(
          `Source ${source.sourceId} extracted paths must be under .specify/sources/extracted/.`
        );
      }
      if (!filesByPath.has(extractedPath)) {
        throw new Error(`Source ${source.sourceId} is missing extracted file ${extractedPath}.`);
      }
    }

    const original = filesByPath.get(source.originalPath);
    if (source.scan.status === 'passed') {
      if (!original) {
        throw new Error(`Passed source ${source.sourceId} must include its original file.`);
      }
      if (!SHA256_PATTERN.test(source.sha256) || original.sha256 !== source.sha256) {
        throw new Error(`Source ${source.sourceId} hash does not match ${source.originalPath}.`);
      }
      if (decodeFileContent(original).byteLength !== source.byteLength) {
        throw new Error(`Source ${source.sourceId} byteLength does not match its original file.`);
      }
      if (source.scan.violations.length > 0) {
        throw new Error(`Passed source ${source.sourceId} cannot contain scan violations.`);
      }
      continue;
    }

    if (original) {
      throw new Error(`Blocked source ${source.sourceId} original must not be committed.`);
    }
    if (source.scan.violations.length === 0) {
      throw new Error(`Blocked source ${source.sourceId} must record scan violations.`);
    }
    const omission = request.omissions.find(
      (candidate) =>
        candidate.sourceId === source.sourceId && candidate.path === source.originalPath
    );
    if (!omission) {
      throw new Error(`Blocked source ${source.sourceId} requires an explicit omission record.`);
    }
  }
}

/** Builds the immutable handoff from approved run and artifact state. */
export function createGoferHandoff(
  request: CreateGoferExportBundleRequest,
  artifactManifestPath: string,
  sourceManifestPath: string,
  auditHistoryPath = artifactManifestPath.replace(/artifact-manifest\.json$/, 'audit-history.json')
): GoferHandoff {
  const readiness = validateGenerationReadiness(request.run, request.artifacts, request.approvals);
  if (!readiness.valid) {
    throw new Error(`Gofer run is not ready for repository export: ${readiness.errors.join(' ')}`);
  }

  const latest = latestArtifactsById(request.artifacts);
  const completedStages = GOFER_PIPELINE_STAGES.filter(
    (stage) =>
      request.run.stages.find((candidate) => candidate.stage === stage)?.status === 'approved'
  );
  const approvedArtifacts = completedStages
    .flatMap(
      (stage) =>
        request.run.stages.find((candidate) => candidate.stage === stage)?.artifactIds ?? []
    )
    .map((artifactId) => latest.get(artifactId))
    .filter((artifact): artifact is GoferArtifactRecord => artifact !== undefined)
    .map(artifactReference)
    .sort(
      (left, right) =>
        compareText(left.artifactId, right.artifactId) || left.version - right.version
    );

  return {
    schemaVersion: GOFER_HANDOFF_SCHEMA_VERSION,
    contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    tenantId: request.run.tenantId,
    appKey: request.run.appKey,
    runId: request.run.runId,
    draftId: request.run.draftId,
    ...(request.run.appId ? { appId: request.run.appId } : {}),
    featureSlug: request.run.featureSlug,
    repositoryAction: request.repositoryAction,
    goferRelease: Object.freeze({ ...request.run.goferRelease }),
    completedStages,
    approvedArtifacts,
    ...(request.run.executionReference
      ? { executionReference: request.run.executionReference }
      : {}),
    exportedAt: request.exportedAt,
    nextAllowedStage: '5_implement',
    artifactManifestPath,
    sourceManifestPath,
    auditHistoryPath,
    omissions: [...request.omissions].sort(compareOmissions),
  };
}

/** Creates a byte-stable, content-addressed `.specify` export for GitHub generation. */
export function createGoferExportBundle(
  request: CreateGoferExportBundleRequest
): GoferExportBundle {
  if (Number.isNaN(Date.parse(request.exportedAt))) {
    throw new Error('exportedAt must be an ISO8601 timestamp.');
  }
  assertRecordOwnership(request);
  assertUniquePaths(request.files);
  const suppliedFiles = request.files.map(contentAddressFile);
  assertPortableGoferScaffold(suppliedFiles, request.run.goferRelease);
  assertPortableOrDeclaredGoferFiles(
    suppliedFiles,
    new Set([
      ...request.artifacts.map((artifact) => artifact.path),
      ...request.sources.flatMap((source) => [source.originalPath, ...source.extractedPaths]),
    ])
  );
  assertRequiredArtifacts(request);

  const featureRoot = `.specify/specs/${request.run.featureSlug}`;
  const artifactManifestPath = `${featureRoot}/artifact-manifest.json`;
  const auditHistoryPath = `${featureRoot}/audit-history.json`;
  const handoffPath = `${featureRoot}/gofer-handoff.json`;
  const sourceManifestPath = '.specify/sources/source-manifest.json';
  const versionPath = '.specify/gofer-version.json';
  const reservedPaths = [
    artifactManifestPath,
    auditHistoryPath,
    handoffPath,
    sourceManifestPath,
    versionPath,
  ];
  for (const reservedPath of reservedPaths) {
    if (suppliedFiles.some((file) => file.path === reservedPath)) {
      throw new Error(`Gofer export input must not replace generated manifest ${reservedPath}.`);
    }
  }

  const filesByPath = new Map(suppliedFiles.map((file) => [file.path, file]));
  assertArtifactFiles(request, filesByPath);
  assertSourceFiles(request, filesByPath);

  const canonicalApprovals = request.approvals.map(canonicalApproval).sort(compareApprovals);
  const artifactManifest: GoferArtifactManifest = {
    schemaVersion: GOFER_ARTIFACT_MANIFEST_SCHEMA_VERSION,
    contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    runId: request.run.runId,
    featureSlug: request.run.featureSlug,
    artifacts: request.artifacts.map(canonicalArtifact).sort(compareArtifacts),
    approvals: canonicalApprovals,
  };
  const sourceManifest: GoferSourceManifest = {
    schemaVersion: GOFER_SOURCE_MANIFEST_SCHEMA_VERSION,
    contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    runId: request.run.runId,
    sources: request.sources.map(canonicalSource).sort(compareSources),
    omissions: [...request.omissions].sort(compareOmissions),
  };
  const auditHistory = createGoferAuditHistory({
    run: request.run,
    approvals: canonicalApprovals,
    events: request.events,
  });
  const handoff = createGoferHandoff(
    request,
    artifactManifestPath,
    sourceManifestPath,
    auditHistoryPath
  );

  const generatedFiles: GoferPortableFileInput[] = [
    {
      path: versionPath,
      encoding: 'utf8',
      content: stringifyGoferManifest({
        schemaVersion: 'eai.gofer.scaffold.v1',
        contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
        goferRelease: request.run.goferRelease,
      }),
    },
    {
      path: artifactManifestPath,
      encoding: 'utf8',
      content: stringifyGoferManifest(artifactManifest),
    },
    {
      path: auditHistoryPath,
      encoding: 'utf8',
      content: stringifyGoferManifest(auditHistory),
    },
    { path: sourceManifestPath, encoding: 'utf8', content: stringifyGoferManifest(sourceManifest) },
    { path: handoffPath, encoding: 'utf8', content: stringifyGoferManifest(handoff) },
  ];

  const files = [...suppliedFiles, ...generatedFiles.map(contentAddressFile)].sort((left, right) =>
    compareText(left.path, right.path)
  );
  assertUniquePaths(files);

  return {
    schemaVersion: GOFER_EXPORT_BUNDLE_SCHEMA_VERSION,
    handoff,
    artifactManifest,
    sourceManifest,
    auditHistory,
    files,
  };
}
