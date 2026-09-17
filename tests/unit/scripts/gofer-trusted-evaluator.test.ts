import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createCapabilityReceipt,
  verifyCapabilityReceipt,
} from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { loadActiveCodexEvaluatorKey, resolveTrustedEvaluatorPublicKey } from '../../../.specify/scripts/node/gofer-trusted-evaluator.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-evaluator-trust-'));
  const workspaceRoot = path.join(root, 'repository');
  const trustRoot = path.join(root, 'trust');
  await mkdir(workspaceRoot);
  await mkdir(trustRoot, { mode: 0o700 });
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  const receipt = createCapabilityReceipt({
    host: 'codex',
    evaluatorVersion: '2',
    evaluationId: 'local-evaluation',
    evaluatedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    hostVersion: 'codex-test',
    models: [{ id: 'observed-model', reasoningEfforts: ['medium'] }],
    reasoningCapabilities: ['medium'],
    toolCapabilities: ['shell'],
    grantedPermissions: ['workspace-write'],
    isolationClass: 'git-worktree+local-os-sandbox',
    provenance: {
      evaluator: 'gofer-native-host-evaluator',
      source: 'native',
      keyId: 'installed-key',
    },
    signingKey: keys.privateKey,
  });
  const registryPath = path.join(trustRoot, 'trusted-evaluators.json');
  const registry = (publicKey = keys.publicKey) => ({
    schemaVersion: 1,
    evaluators: [
      {
        keyId: 'installed-key',
        host: 'codex',
        evaluator: 'gofer-native-host-evaluator',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    ],
  });
  await writeFile(registryPath, JSON.stringify(registry()), { mode: 0o600 });
  return { root, workspaceRoot, trustRoot, registryPath, receipt, registry, keys };
}

describe.skipIf(process.platform === 'win32')('locally trusted evaluator keys', () => {
  it('requires an activated key matching the registered public identity', async () => {
    const f = await fixture();
    try {
      await expect(loadActiveCodexEvaluatorKey({ workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot })).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
      const active = path.join(f.trustRoot, 'active-keys');
      await mkdir(active, { mode: 0o700 });
      const identity = path.join(active, 'codex-evaluator.json');
      const privateFile = path.join(active, 'codex-evaluator.private.pem');
      await writeFile(identity, JSON.stringify({ schemaVersion: 1, host: 'codex',
        evaluator: 'gofer-native-host-evaluator', keyId: 'installed-key' }), { mode: 0o600 });
      await writeFile(privateFile, f.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        { mode: 0o600 });
      const activeKey = await loadActiveCodexEvaluatorKey({ workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot });
      expect(activeKey.keyId).toBe('installed-key');
      expect(activeKey.privateKey.asymmetricKeyType).toBe('ed25519');
      await writeFile(privateFile, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
      await expect(loadActiveCodexEvaluatorKey({ workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot })).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
      await writeFile(privateFile, f.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      await chmod(privateFile, 0o644);
      await expect(loadActiveCodexEvaluatorKey({ workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot })).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')(
    'does not trust a caller-selected HOME directory',
    async () => {
      const f = await fixture();
      try {
        const fakeHome = path.join(f.root, 'caller-home');
        const fakeTrustRoot = path.join(fakeHome, '.eai-gofer-trust');
        await mkdir(fakeTrustRoot, { recursive: true, mode: 0o700 });
        await writeFile(
          path.join(fakeTrustRoot, 'trusted-evaluators.json'),
          JSON.stringify(f.registry()),
          { mode: 0o600 }
        );
        const moduleUrl = pathToFileURL(
          path.resolve('.specify/scripts/node/gofer-trusted-evaluator.mjs')
        );
        const script = `import { resolveTrustedEvaluatorPublicKey } from ${JSON.stringify(moduleUrl.href)};
        await resolveTrustedEvaluatorPublicKey(JSON.parse(process.argv[1]),
          { workspaceRoot: process.argv[2] }).then(() => process.exit(0), () => process.exit(1));`;
        const child = spawnSync(
          process.execPath,
          ['--input-type=module', '-e', script, JSON.stringify(f.receipt), f.workspaceRoot],
          {
            env: { ...process.env, HOME: fakeHome },
            encoding: 'utf8',
            timeout: 10000,
          }
        );
        expect(child.status).toBe(1);
      } finally {
        await rm(f.root, { recursive: true, force: true });
      }
    }
  );

  it('uses the installed host and key identity, not a caller-supplied public key', async () => {
    const f = await fixture();
    try {
      const key = await resolveTrustedEvaluatorPublicKey(f.receipt, {
        workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot,
      });
      expect(verifyCapabilityReceipt(f.receipt, { publicKey: key, host: 'codex' })).toBe(true);
      const wrong = generateKeyPairSync('ed25519');
      await writeFile(f.registryPath, JSON.stringify(f.registry(wrong.publicKey)));
      const wrongKey = await resolveTrustedEvaluatorPublicKey(f.receipt, {
        workspaceRoot: f.workspaceRoot,
        trustRoot: f.trustRoot,
      });
      expect(verifyCapabilityReceipt(f.receipt, { publicKey: wrongKey, host: 'codex' })).toBe(
        false
      );
      await expect(
        resolveTrustedEvaluatorPublicKey(
          {
            ...f.receipt,
            provenance: {
              ...f.receipt.provenance,
              keyId: 'unknown-key',
            },
          },
          { workspaceRoot: f.workspaceRoot, trustRoot: f.trustRoot }
        )
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('rejects writable or linked trust files and a trust root inside the worker workspace', async () => {
    const f = await fixture();
    try {
      await chmod(f.registryPath, 0o644);
      await expect(
        resolveTrustedEvaluatorPublicKey(f.receipt, {
          workspaceRoot: f.workspaceRoot,
          trustRoot: f.trustRoot,
        })
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
      await chmod(f.registryPath, 0o600);
      await rm(f.registryPath);
      await symlink(path.join(f.root, 'missing'), f.registryPath);
      await expect(
        resolveTrustedEvaluatorPublicKey(f.receipt, {
          workspaceRoot: f.workspaceRoot,
          trustRoot: f.trustRoot,
        })
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
      await expect(
        resolveTrustedEvaluatorPublicKey(f.receipt, {
          workspaceRoot: f.workspaceRoot,
          trustRoot: f.workspaceRoot,
        })
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('rejects an oversized registry after opening the file', async () => {
    const f = await fixture();
    try {
      await writeFile(f.registryPath, ' '.repeat(65537), { mode: 0o600 });
      await expect(
        resolveTrustedEvaluatorPublicKey(f.receipt, {
          workspaceRoot: f.workspaceRoot,
          trustRoot: f.trustRoot,
        })
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a parent directory that another account can replace through', async () => {
    const f = await fixture();
    try {
      await chmod(f.root, 0o770);
      await expect(
        resolveTrustedEvaluatorPublicKey(f.receipt, {
          workspaceRoot: f.workspaceRoot,
          trustRoot: f.trustRoot,
        })
      ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
