import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bootstrapWorkspace } from '../../../.specify/scripts/node/workspace-bootstrap-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe.skipIf(process.platform === 'win32')('automatic trust identity staging on install', () => {
  it('stages a fresh account trust identity the first time Gofer bootstraps a workspace', async () => {
    const parent = await mkdtemp(path.join(os.homedir(), 'gofer-bootstrap-trust-'));
    const workspaceRoot = path.join(parent, 'workspace');
    const trustRoot = path.join(parent, 'trust');
    try {
      await mkdir(workspaceRoot, { recursive: true });
      const report = await bootstrapWorkspace({
        workspaceRoot,
        host: 'claude',
        sourceRoot: REPO_ROOT,
        trustRoot,
      });
      expect(report.trustIdentity).toMatchObject({
        attempted: true,
        alreadyExists: false,
        active: false,
      });
      expect(report.trustIdentity.identities).toHaveLength(2);
      const registry = JSON.parse(
        await readFile(path.join(trustRoot, 'trusted-evaluators.json'), 'utf8')
      );
      expect(registry).toEqual({ schemaVersion: 1, evaluators: [] });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('is silently idempotent on a second bootstrap of a different workspace for the same account', async () => {
    const parent = await mkdtemp(path.join(os.homedir(), 'gofer-bootstrap-trust-'));
    const trustRoot = path.join(parent, 'trust');
    const workspaceA = path.join(parent, 'workspace-a');
    const workspaceB = path.join(parent, 'workspace-b');
    try {
      await mkdir(workspaceA, { recursive: true });
      await mkdir(workspaceB, { recursive: true });
      await bootstrapWorkspace({
        workspaceRoot: workspaceA,
        host: 'claude',
        sourceRoot: REPO_ROOT,
        trustRoot,
      });
      const second = await bootstrapWorkspace({
        workspaceRoot: workspaceB,
        host: 'claude',
        sourceRoot: REPO_ROOT,
        trustRoot,
      });
      expect(second.trustIdentity).toEqual({
        attempted: true,
        root: trustRoot,
        staged: false,
        alreadyExists: true,
        active: false,
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('never stages during a dry run', async () => {
    const parent = await mkdtemp(path.join(os.homedir(), 'gofer-bootstrap-trust-'));
    const trustRoot = path.join(parent, 'trust');
    const workspaceRoot = path.join(parent, 'workspace');
    try {
      await mkdir(workspaceRoot, { recursive: true });
      const report = await bootstrapWorkspace({
        workspaceRoot,
        host: 'claude',
        sourceRoot: REPO_ROOT,
        dryRun: true,
        trustRoot,
      });
      expect(report.trustIdentity).toEqual({ attempted: false });
      await expect(
        readFile(path.join(trustRoot, 'trusted-evaluators.json'), 'utf8')
      ).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
