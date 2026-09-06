export type Pattern = 'single' | 'cascade' | 'critique';
export type Phase = 'worker' | 'escalator' | 'critic' | 'repair' | 'synthesis' | 'validation';
export type Role = 'worker' | 'escalator' | 'critic';
/** Input tokens include cached input when the host reports it; cache is a separate
 * informational metric, never added to input or used to guess pricing. */
export type Metrics = { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; costUsd: number | null };
export type ContextRefs = Record<'spec' | 'acceptance' | 'platform' | 'language' | 'permissions', string[]>;
export interface RoleModel { id: string; family: string; available: boolean; nativeCompound: boolean }
export interface Attempt {
  id: string;
  /** A phase label is not role evidence: critique transitions require exact
   * modelId/family matches against the approved, host-verified route. */
  phase: Phase;
  modelId: string;
  family: string;
  /** The revision and criterion of the resulting work, not an obsolete input revision. */
  revision: string;
  criterion: string;
  status: 'succeeded' | 'failed' | 'running' | 'cancelled' | 'timed_out';
  startedAtMs: number;
  finishedAtMs?: number | null;
  usage?: Partial<Metrics> | null;
}
export interface Evidence {
  ref: string;
  attemptId: string;
  revision: string;
  criterion: string;
  kind: 'test' | 'lint' | 'typecheck' | 'acceptance' | 'confidence' | 'review';
  status: 'pass' | 'fail' | 'blocked' | 'unknown';
  deterministic: boolean;
  observedAtMs: number;
}
/** Caller is a trusted host adapter, not cryptographically authenticated evidence.
 * Pass the complete sequential attempt ledger, including all failed/cost-bearing legs.
 * A completed critic must immediately follow a successful approved worker/repair
 * on the active revision/criterion, with the exact approved critic identity and
 * a different family. Invalid history returns to validation without delegation.
 * Cascade requires distinct approved worker/escalator IDs and exact recorded
 * identity/phase matches. After the escalator it returns to validation; it never
 * invents another tier or describes same-model retries as further escalation.
 * Clocks are epoch milliseconds from that adapter, never a model's claimed time.
 * References are explicit opaque refs; the host resolves them and enforces permissions.
 */
export interface OrchestrationInput {
  policy: {
    enabled: true;
    approved: boolean;
    route: { pattern: Pattern; worker: string; escalator?: string; critic?: string };
    maxAttempts: number;
    maxElapsedMs: number;
    maxEvidenceAgeMs: number;
    maxCostUsd?: number;
  };
  /** Canonical host identity shared by CLI/desktop, not a surface/product whitelist. */
  host: string;
  nowMs: number;
  startedAtMs: number;
  cancelled: boolean;
  revision: string;
  criterion: string;
  context: ContextRefs;
  capabilities?: {
    host: string;
    verified: boolean;
    observedAtMs: number;
    modelSelection: boolean;
    readOnlyIsolation: boolean;
    models: RoleModel[];
  } | null;
  attempts: Attempt[];
  evidence: Evidence[];
}
export interface UsageSummary {
  attempts: number;
  total: Metrics;
  reported: Metrics;
  byPhase: Partial<Record<Phase, { attempts: number; total: Metrics; reported: Metrics }>>;
}
export interface OrchestrationDecision {
  status: 'legacy' | 'delegate' | 'stop' | 'wait' | 'validate' | 'invalid';
  reason: string;
  pattern: Pattern | null;
  canClaimDone: false;
  usage: UsageSummary | null;
  action: {
    role: Role;
    phase: Phase;
    modelId: string;
    family: string;
    /** Additional restriction only; false never grants write access. */
    readOnly: boolean;
    inheritContext: false;
    context: ContextRefs;
    revision: string;
    criterion: string;
    evidenceRef: string | null;
    limits: { remainingAttempts: number; remainingMs: number; remainingCostUsd: number | null };
  } | null;
}
export function aggregateUsage(attempts: Array<{ phase: Phase; usage?: Partial<Metrics> | null }>): UsageSummary;
export function planOrchestration(input?: unknown): OrchestrationDecision;
