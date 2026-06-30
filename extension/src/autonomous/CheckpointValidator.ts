/**
 * CheckpointValidator — validates session handoff YAML frontmatter
 *
 * Ensures checkpoint files have required fields and stay within
 * size budgets. Warnings only — never blocks saves.
 *
 * 018 T061/T063: Enhanced with git state capture and required field validation.
 *
 * @see .specify/specs/016-top5-context-gaps/plan.md Fix 8 (E5)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  CapabilityRemovalApprovalGate,
  type CapabilityRemovalApprovalGateResult,
} from '../services/enterpriseai/governance/CapabilityRemovalApprovalGate';

const execFileAsync = promisify(execFile);

export interface CheckpointValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/** 018 T061: Git state captured with checkpoint */
export interface GitState {
  branch: string;
  status: string;
  stashCount: number;
  headCommit: string;
}

export interface ReleaseValidationInput {
  specDir: string;
  runId: string;
  changeSetId: string;
  removedCapabilities: readonly string[];
  requireRemovalApprovalLog: boolean;
}

export interface ReleaseValidationResult extends CheckpointValidationResult {
  gatePassed: boolean;
  blockedCapabilities: readonly string[];
  approvalGateResult?: CapabilityRemovalApprovalGateResult;
}

const REQUIRED_FIELDS = ['session_id', 'timestamp', 'stage', 'status'];
const MAX_TOKEN_BUDGET = 8000;

export class CheckpointValidator {
  private workspaceRoot?: string;
  private readonly capabilityRemovalApprovalGate: CapabilityRemovalApprovalGate;

  constructor(
    workspaceRoot?: string,
    capabilityRemovalApprovalGate: CapabilityRemovalApprovalGate = new CapabilityRemovalApprovalGate()
  ) {
    this.workspaceRoot = workspaceRoot;
    this.capabilityRemovalApprovalGate = capabilityRemovalApprovalGate;
  }

  /**
   * Validate a session handoff markdown document.
   * Checks YAML frontmatter required fields and overall size.
   */
  validate(content: string): CheckpointValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      errors.push('Missing YAML frontmatter (expected --- delimiters)');
      return { valid: false, warnings, errors };
    }

    const frontmatter = frontmatterMatch[1];

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      const pattern = new RegExp(`^${field}\\s*:`, 'm');
      if (!pattern.test(frontmatter)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (!content.includes('# Session Handoff')) {
      warnings.push('Missing section: "# Session Handoff"');
    }

    if (!content.includes('Continue from') && !content.includes('Resume with')) {
      warnings.push('Missing section: "Continue from checkpoint"');
    }

    // Check token budget (chars / 4)
    const estimatedTokens = Math.ceil(content.length / 4);
    if (estimatedTokens > MAX_TOKEN_BUDGET) {
      warnings.push(
        `Checkpoint is ${estimatedTokens} tokens (budget: ${MAX_TOKEN_BUDGET}). Consider trimming.`
      );
    }

    // Check for empty critical sections
    const criticalSections = ['Key Decisions', 'Next Steps'];
    for (const section of criticalSections) {
      // Match the section heading
      const headingIdx = content.indexOf(`## ${section}`);
      if (headingIdx === -1) {
        continue;
      }

      // Find where the content after the heading starts (skip heading line + blank lines)
      const afterHeading = content.slice(headingIdx + `## ${section}`.length);
      // Find the next section heading or end of string
      const nextSectionMatch = afterHeading.match(/\n## /);
      const sectionBody = nextSectionMatch
        ? afterHeading.slice(0, nextSectionMatch.index)
        : afterHeading;

      // Check if section body has any non-whitespace content
      if (sectionBody.trim().length === 0) {
        warnings.push(`Section "${section}" exists but has no content`);
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * 018 T063: Validate required fields are present and non-empty.
   */
  validateRequiredFields(data: Record<string, unknown>): CheckpointValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const field of REQUIRED_FIELDS) {
      if (
        !(field in data) ||
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ''
      ) {
        errors.push(`Missing or empty required field: ${field}`);
      }
    }

    // Validate timestamp format
    if (data.timestamp && typeof data.timestamp === 'string') {
      const parsed = Date.parse(data.timestamp);
      if (isNaN(parsed)) {
        warnings.push(`Invalid timestamp format: ${data.timestamp}`);
      }
    }

    // Validate stage is a known stage
    const validStages = [
      'research',
      'specify',
      'plan',
      'tasks',
      'implement',
      'validate',
      'unknown',
    ];
    if (data.stage && typeof data.stage === 'string' && !validStages.includes(data.stage)) {
      warnings.push(`Unknown stage: ${data.stage}`);
    }

    return { valid: errors.length === 0, warnings, errors };
  }

  /**
   * 019 T065-T067: Validate pipeline artifacts in a spec directory.
   * Checks existence and section completeness of research.md, spec.md, plan.md, tasks.md.
   * Returns structured validation report with warnings and errors.
   */
  validatePipelineArtifacts(specDir: string): CheckpointValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    const artifacts = [
      {
        file: 'research.md',
        requiredSections: ['# Research', 'Codebase Analysis', 'Integration Points'],
        stage: 'research',
      },
      {
        file: 'spec.md',
        requiredSections: ['User Stories', 'Functional Requirements', 'Success Criteria'],
        stage: 'specify',
      },
      { file: 'plan.md', requiredSections: ['Implementation Plan', 'Phase'], stage: 'plan' },
      { file: 'tasks.md', requiredSections: ['Tasks', 'Phase'], stage: 'tasks' },
    ];

    for (const artifact of artifacts) {
      const filePath = path.join(specDir, artifact.file);

      if (!fs.existsSync(filePath)) {
        warnings.push(`Missing artifact: ${artifact.file} (stage: ${artifact.stage})`);
        continue;
      }

      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        errors.push(`Cannot read artifact: ${artifact.file}`);
        continue;
      }

      // Check minimum size
      if (content.length < 100) {
        warnings.push(
          `${artifact.file} appears too small (${content.length} chars) — may be incomplete`
        );
      }

      // Check YAML frontmatter
      if (!content.startsWith('---')) {
        warnings.push(`${artifact.file} missing YAML frontmatter`);
      }

      // Check required sections
      for (const section of artifact.requiredSections) {
        if (!content.includes(section)) {
          warnings.push(`${artifact.file} missing expected section: "${section}"`);
        }
      }

      // tasks.md specific: check for task checkboxes
      if (artifact.file === 'tasks.md') {
        const taskCount = (content.match(/- \[[ Xx]\]/g) || []).length;
        if (taskCount === 0) {
          errors.push('tasks.md has no task checkboxes (expected - [ ] or - [X] format)');
        }
        const completedCount = (content.match(/- \[[Xx]\]/g) || []).length;
        if (taskCount > 0) {
          const progress = Math.round((completedCount / taskCount) * 100);
          warnings.push(
            `tasks.md progress: ${completedCount}/${taskCount} tasks completed (${progress}%)`
          );
        }
      }
    }

    return { valid: errors.length === 0, warnings, errors };
  }

  /**
   * Validates release readiness with capability-removal governance gates.
   * Reuses pipeline artifact validation and optionally enforces explicit
   * per-capability approval records for removal/disablement changes.
   */
  async validateReleaseReadiness(input: ReleaseValidationInput): Promise<ReleaseValidationResult> {
    const artifactValidation = this.validatePipelineArtifacts(input.specDir);
    const warnings = [...artifactValidation.warnings];
    const errors = [...artifactValidation.errors];

    const normalizedCapabilities = this.normalizeCapabilities(input.removedCapabilities);
    if (!input.requireRemovalApprovalLog || normalizedCapabilities.length < 1) {
      return {
        valid: errors.length === 0,
        warnings,
        errors,
        gatePassed: errors.length === 0,
        blockedCapabilities: [],
      };
    }

    const approvalGateResult = await this.capabilityRemovalApprovalGate.evaluate({
      runId: input.runId,
      changeSetId: input.changeSetId,
      capabilities: normalizedCapabilities,
    });

    if (!approvalGateResult.allowed) {
      const blockedSummary = approvalGateResult.blockedCapabilities.join(', ');
      errors.push(
        `VAL_REMOVAL_APPROVAL_MISSING: explicit approval required for ${blockedSummary}.`
      );
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
      gatePassed: approvalGateResult.allowed && errors.length === 0,
      blockedCapabilities: approvalGateResult.blockedCapabilities,
      approvalGateResult,
    };
  }

  /**
   * 018 T061: Capture current git state for checkpoint context.
   */
  async captureGitState(): Promise<GitState> {
    const cwd = this.workspaceRoot;
    if (!cwd) {
      return { branch: 'unknown', status: '', stashCount: 0, headCommit: '' };
    }

    const opts = { cwd };
    const gitState: GitState = { branch: 'unknown', status: '', stashCount: 0, headCommit: '' };

    try {
      const { stdout: branch } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        opts
      );
      gitState.branch = branch.trim();
    } catch {
      /* not a git repo */
    }

    try {
      const { stdout: status } = await execFileAsync(
        'git',
        ['status', '--porcelain', '--short'],
        opts
      );
      gitState.status = status.trim().slice(0, 500); // Limit size
    } catch {
      /* ignore */
    }

    try {
      const { stdout: stash } = await execFileAsync('git', ['stash', 'list'], opts);
      gitState.stashCount = stash.split('\n').filter(Boolean).length;
    } catch {
      /* ignore */
    }

    try {
      const { stdout: head } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], opts);
      gitState.headCommit = head.trim();
    } catch {
      /* ignore */
    }

    return gitState;
  }

  private normalizeCapabilities(capabilities: readonly string[]): readonly string[] {
    return Array.from(
      new Set(
        capabilities
          .map((capability: string): string => capability.trim())
          .filter((capability: string): boolean => capability.length > 0)
      )
    );
  }
}
