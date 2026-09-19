import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmod, link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptSigningKey,
  encryptSigningKey,
} from '../../../.specify/scripts/node/gofer-encrypted-key.mjs';
import { parseSignArguments } from '../../../.specify/scripts/node/gofer-benchmark-sign.mjs';
import { promptHidden } from '../../../.specify/scripts/node/gofer-tty-prompt.mjs';
import { runVerifierKeyCeremony } from '../../../.specify/scripts/node/gofer-verifier-key-ceremony.mjs';
import {
  loadActiveBenchmarkVerifierKey,
  resolveTrustedEvaluatorPublicKey,
} from '../../../.specify/scripts/node/gofer-trusted-evaluator.mjs';
import { installVerifier, makeProtectedDirectory, PASSPHRASE, VERIFIER } from '../../helpers/verifierCustody';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function temp(prefix: string) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}
async function trust() {
  const root = await temp('gofer-custody-trust-');
  const workspaceRoot = await temp('gofer-custody-workspace-');
  // The account registry is required to exist for the non-verifier path.
  await writeFile(path.join(root, 'trusted-evaluators.json'), JSON.stringify({ schemaVersion: 1, evaluators: [] }), { mode: 0o600 });
  return { root, workspaceRoot };
}
const receiptFor = (keyId: string) => ({ host: 'codex', provenance: { evaluator: VERIFIER, keyId } });
const uid = process.getuid?.() ?? 0;

describe('encrypted signing key', () => {
  it('round-trips and never stores the key in the clear', async () => {
    const pair = generateKeyPairSync('ed25519');
    const envelope = await encryptSigningKey(pair.privateKey, PASSPHRASE);
    const der = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
    const text = JSON.stringify(envelope);
    expect(text).not.toContain(der.toString('base64'));
    expect(text).not.toContain(der.toString('base64url'));
    expect(text).not.toContain(der.toString('hex'));
    const restored = await decryptSigningKey(envelope, PASSPHRASE);
    const signature = sign(null, Buffer.from('m'), restored);
    expect(verify(null, Buffer.from('m'), pair.publicKey, signature)).toBe(true);
  });

  it('rejects a wrong or weak passphrase', async () => {
    const pair = generateKeyPairSync('ed25519');
    const envelope = await encryptSigningKey(pair.privateKey, PASSPHRASE);
    await expect(decryptSigningKey(envelope, 'a different passphrase')).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
    await expect(encryptSigningKey(pair.privateKey, 'short')).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
    await expect(decryptSigningKey(envelope, 'short')).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
  });

  it.each(['ciphertext', 'tag', 'iv', 'salt'])('rejects a tampered %s', async (field) => {
    const pair = generateKeyPairSync('ed25519');
    const envelope = JSON.parse(JSON.stringify(await encryptSigningKey(pair.privateKey, PASSPHRASE)));
    const flip = (value: string) => `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
    if (field === 'ciphertext') envelope.ciphertext = flip(envelope.ciphertext);
    else if (field === 'salt') envelope.kdf.salt = flip(envelope.kdf.salt);
    else envelope.cipher[field] = flip(envelope.cipher[field]);
    await expect(decryptSigningKey(envelope, PASSPHRASE)).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
  });

  it('rejects a weakened key-derivation setting and a non-Ed25519 key', async () => {
    const pair = generateKeyPairSync('ed25519');
    const envelope = JSON.parse(JSON.stringify(await encryptSigningKey(pair.privateKey, PASSPHRASE)));
    envelope.kdf.N = 2;
    await expect(decryptSigningKey(envelope, PASSPHRASE)).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
    await expect(encryptSigningKey(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, PASSPHRASE)).rejects.toThrow(
      'ENCRYPTED_KEY_REQUIRED'
    );
  });
});

describe('protected verifier registry', () => {
  it('trusts a verifier key only from a registry the expected owner controls', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root, activate: false });
    roots.push(v.protectedDirectory);
    const key = await resolveTrustedEvaluatorPublicKey(receiptFor('verifier-key'), {
      workspaceRoot: t.workspaceRoot, trustRoot: t.root, protectedRegistry: v.protectedRegistry,
    });
    expect(key.asymmetricKeyType).toBe('ed25519');
    await expect(
      resolveTrustedEvaluatorPublicKey(receiptFor('unknown-key'), {
        workspaceRoot: t.workspaceRoot, trustRoot: t.root, protectedRegistry: v.protectedRegistry,
      })
    ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  it('requires root ownership in production, so an account-owned registry is refused', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root, activate: false });
    roots.push(v.protectedDirectory);
    await expect(
      resolveTrustedEvaluatorPublicKey(receiptFor('verifier-key'), {
        workspaceRoot: t.workspaceRoot, trustRoot: t.root, protectedRegistry: { path: v.protectedRegistry.path },
      })
    ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    await expect(
      resolveTrustedEvaluatorPublicKey(receiptFor('verifier-key'), {
        workspaceRoot: t.workspaceRoot, trustRoot: t.root,
      })
    ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  it('ignores a verifier key that the account itself registered', async () => {
    const t = await trust();
    const keys = generateKeyPairSync('ed25519');
    await writeFile(
      path.join(t.root, 'trusted-evaluators.json'),
      JSON.stringify({
        schemaVersion: 1,
        evaluators: [{ keyId: 'self-registered', host: 'codex', evaluator: VERIFIER,
          publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }],
      }),
      { mode: 0o600 }
    );
    const empty = await installVerifier({ trustRoot: t.root, activate: false, registered: false });
    roots.push(empty.protectedDirectory);
    await expect(
      resolveTrustedEvaluatorPublicKey(receiptFor('self-registered'), {
        workspaceRoot: t.workspaceRoot, trustRoot: t.root, protectedRegistry: empty.protectedRegistry,
      })
    ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  const lookup = async (mutate: (registryPath: string, directory: string) => Promise<void>) => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root, activate: false });
    roots.push(v.protectedDirectory);
    await mutate(v.protectedRegistry.path, v.protectedDirectory);
    return resolveTrustedEvaluatorPublicKey(receiptFor('verifier-key'), {
      workspaceRoot: t.workspaceRoot, trustRoot: t.root, protectedRegistry: v.protectedRegistry,
    });
  };

  it.each([
    ['a group-writable file', async (file: string) => chmod(file, 0o664)],
    ['a world-writable file', async (file: string) => chmod(file, 0o666)],
    ['a group-writable directory', async (_file: string, directory: string) => chmod(directory, 0o775)],
    ['a world-writable directory', async (_file: string, directory: string) => chmod(directory, 0o777)],
    ['an oversized file', async (file: string) => writeFile(file, ' '.repeat(70000))],
    ['a symbolic link', async (file: string, directory: string) => {
      const real = path.join(directory, 'real.json');
      await writeFile(real, await readFile(file), { mode: 0o644 });
      await rm(file);
      await symlink(real, file);
    }],
    ['a hard link', async (file: string, directory: string) => link(file, path.join(directory, 'second-name.json'))],
    ['a registry with a non-verifier entry', async (file: string) => {
      const registry = JSON.parse(await readFile(file, 'utf8'));
      registry.evaluators[0].evaluator = 'gofer-native-host-evaluator';
      await writeFile(file, JSON.stringify(registry));
    }],
  ])('rejects %s', async (_name, mutate) => {
    await expect(lookup(mutate)).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  it('rejects a registry file owned by someone other than the expected owner', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root, activate: false });
    roots.push(v.protectedDirectory);
    await expect(
      resolveTrustedEvaluatorPublicKey(receiptFor('verifier-key'), {
        workspaceRoot: t.workspaceRoot, trustRoot: t.root,
        protectedRegistry: { path: v.protectedRegistry.path, ownerUid: uid + 1 },
      })
    ).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });
});

describe('active verifier key loading', () => {
  const load = (t: { root: string; workspaceRoot: string }, v: Awaited<ReturnType<typeof installVerifier>>, extra = {}) =>
    loadActiveBenchmarkVerifierKey({
      workspaceRoot: t.workspaceRoot, trustRoot: t.root,
      getPassphrase: v.getPassphrase, protectedRegistry: v.protectedRegistry, ...extra,
    });

  it('loads with the right passphrase and refuses without one', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root });
    roots.push(v.protectedDirectory);
    expect((await load(t, v)).keyId).toBe('verifier-key');
    await expect(load(t, v, { getPassphrase: undefined })).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    await expect(load(t, v, { getPassphrase: async () => 'the wrong passphrase' })).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  it('never loads a plaintext key, even one that matches the registry', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root });
    roots.push(v.protectedDirectory);
    const active = path.join(t.root, 'active-keys');
    await rm(path.join(active, 'heldout-verifier.private.enc.json'));
    await writeFile(path.join(active, 'heldout-verifier.private.pem'),
      v.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    await expect(load(t, v)).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
  });

  it('refuses an envelope for a key other than the registered one, and loose file modes', async () => {
    const t = await trust();
    const v = await installVerifier({ trustRoot: t.root });
    roots.push(v.protectedDirectory);
    const envelopeFile = path.join(t.root, 'active-keys', 'heldout-verifier.private.enc.json');
    const good = await readFile(envelopeFile, 'utf8');
    await chmod(envelopeFile, 0o644);
    await expect(load(t, v)).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    await writeFile(envelopeFile, JSON.stringify(await encryptSigningKey(generateKeyPairSync('ed25519').privateKey, PASSPHRASE)), { mode: 0o600 });
    await chmod(envelopeFile, 0o600);
    await expect(load(t, v)).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    await writeFile(envelopeFile, good, { mode: 0o600 });
    expect((await load(t, v)).keyId).toBe('verifier-key');
  });
});

describe('key ceremony', () => {
  const answers = (...values: string[]) => {
    const queue = [...values];
    return async () => queue.shift() as string;
  };

  it('creates an encrypted key that only loads after an administrator installs the registry', async () => {
    const t = await trust();
    await chmod(t.root, 0o700);
    const protectedDirectory = await makeProtectedDirectory();
    roots.push(protectedDirectory);
    const registryPath = path.join(protectedDirectory, 'verifier-registry.json');
    const result = await runVerifierKeyCeremony({
      trustRoot: t.root, getPassphrase: answers(PASSPHRASE, PASSPHRASE), keyId: 'ceremony-key-1', registryPath,
    });
    const active = path.join(t.root, 'active-keys');
    expect(await readFile(path.join(active, 'heldout-verifier.private.enc.json'), 'utf8')).not.toContain('PRIVATE KEY');
    expect(result.installCommands.join('\n')).toContain('sudo install -o root -g wheel -m 0644');
    const options = { workspaceRoot: t.workspaceRoot, trustRoot: t.root,
      getPassphrase: async () => PASSPHRASE, protectedRegistry: { path: registryPath, ownerUid: uid } };
    // Not trusted yet: the ceremony wrote nothing to the protected registry.
    await expect(loadActiveBenchmarkVerifierKey(options)).rejects.toThrow('TRUSTED_EVALUATOR_REQUIRED');
    // Stand-in for the administrator's install step.
    await writeFile(registryPath, await readFile(result.pendingPath), { mode: 0o644 });
    const loaded = await loadActiveBenchmarkVerifierKey(options);
    expect(loaded.keyId).toBe('ceremony-key-1');
  });

  it('keeps earlier verifier keys in the pending registry', async () => {
    const t = await trust();
    await chmod(t.root, 0o700);
    const earlier = { keyId: 'earlier-key-1', host: 'codex', evaluator: VERIFIER, publicKeyPem: 'pem' };
    const result = await runVerifierKeyCeremony({
      trustRoot: t.root, getPassphrase: answers(PASSPHRASE, PASSPHRASE), keyId: 'ceremony-key-2',
      existingEntries: [earlier], registryPath: '/nonexistent/verifier-registry.json',
    });
    const pending = JSON.parse(await readFile(result.pendingPath, 'utf8'));
    expect(pending.evaluators.map((entry: { keyId: string }) => entry.keyId)).toEqual(['earlier-key-1', 'ceremony-key-2']);
  });

  it('refuses mismatched passphrases, a weak one, an existing identity, and a loose trust folder', async () => {
    const t = await trust();
    await chmod(t.root, 0o700);
    const base = { trustRoot: t.root, registryPath: '/nonexistent/verifier-registry.json' };
    await expect(runVerifierKeyCeremony({ ...base, getPassphrase: answers(PASSPHRASE, 'another passphrase') })).rejects.toThrow(
      'VERIFIER_KEY_CEREMONY_REQUIRES_REVIEW'
    );
    await expect(runVerifierKeyCeremony({ ...base, getPassphrase: answers('short', 'short') })).rejects.toThrow('ENCRYPTED_KEY_REQUIRED');
    await runVerifierKeyCeremony({ ...base, getPassphrase: answers(PASSPHRASE, PASSPHRASE), keyId: 'first-key-1' });
    await expect(
      runVerifierKeyCeremony({ ...base, getPassphrase: answers(PASSPHRASE, PASSPHRASE), keyId: 'second-key-1' })
    ).rejects.toThrow();
    const loose = await trust();
    await chmod(loose.root, 0o755);
    await expect(runVerifierKeyCeremony({ ...base, trustRoot: loose.root, getPassphrase: answers(PASSPHRASE, PASSPHRASE) })).rejects.toThrow(
      'VERIFIER_KEY_CEREMONY_REQUIRES_REVIEW'
    );
  });
});

describe('terminal-only passphrase entry', () => {
  function fakeTerminal(isTTY: boolean) {
    const stdin = Object.assign(new EventEmitter(), {
      isTTY, raw: false, setRawMode(value: boolean) { this.raw = value; }, resume() {}, pause() {},
    });
    const out: string[] = [];
    const stdout = { isTTY, write: (value: string) => out.push(value) };
    return { stdin, stdout, out };
  }

  it('refuses a pipe or file as the source', () => {
    const t = fakeTerminal(false);
    expect(() => promptHidden('Passphrase: ', t as never)).toThrow('INTERACTIVE_TERMINAL_REQUIRED');
  });

  it('reads typed characters without echoing them, and honours backspace and cancel', async () => {
    const t = fakeTerminal(true);
    const pending = promptHidden('Passphrase: ', t as never);
    t.stdin.emit('data', Buffer.from(`abcx${String.fromCharCode(127)}d\r`));
    await expect(pending).resolves.toBe('abcd');
    expect(t.out.join('')).not.toContain('abcd');
    expect(t.stdin.raw).toBe(false);
    const cancelled = fakeTerminal(true);
    const second = promptHidden('Passphrase: ', cancelled as never);
    cancelled.stdin.emit('data', Buffer.from(String.fromCharCode(3)));
    await expect(second).rejects.toThrow('PASSPHRASE_ENTRY_CANCELLED');
  });
});

describe('human-gated signing command', () => {
  const args = ['--workspace-root', '/w', '--snapshot-id', 'a'.repeat(64), '--capability-receipt', '/r.json', '--out', '/o.json'];

  it('accepts exactly the four required absolute arguments', () => {
    expect(parseSignArguments(args)).toMatchObject({ workspaceRoot: '/w', snapshotId: 'a'.repeat(64), out: '/o.json' });
    for (const bad of [
      args.slice(0, 6),
      [...args, '--out', '/x'],
      args.map((value) => (value === '/w' ? 'relative' : value)),
      args.map((value) => (value === 'a'.repeat(64) ? 'nothex' : value)),
      [...args, '--extra', 'x'],
    ]) expect(() => parseSignArguments(bad)).toThrow('BENCHMARK_SIGN_COMMAND_REQUIRED');
  });

  it('accepts an optional attestation lifetime of 1 to 240 minutes, and nothing else', () => {
    expect(parseSignArguments([...args, '--ttl-minutes', '240']).ttlMs).toBe(240 * 60 * 1000);
    expect(parseSignArguments(args).ttlMs).toBeUndefined();
    for (const bad of ['0', '241', '-5', '1.5', 'abc', '']) {
      expect(() => parseSignArguments([...args, '--ttl-minutes', bad])).toThrow('BENCHMARK_SIGN_COMMAND_REQUIRED');
    }
    expect(() => parseSignArguments([...args, '--ttl-minutes', '60', '--ttl-minutes', '60'])).toThrow(
      'BENCHMARK_SIGN_COMMAND_REQUIRED'
    );
  });

  it('refuses to run without a terminal and writes nothing', async () => {
    const out = path.join(await temp('gofer-sign-out-'), 'attestation.json');
    const script = path.resolve('.specify/scripts/node/gofer-benchmark-sign.mjs');
    const result = spawnSync(process.execPath, [script, '--workspace-root', '/w', '--snapshot-id', 'a'.repeat(64),
      '--capability-receipt', '/r.json', '--out', out], { encoding: 'utf8', input: PASSPHRASE, timeout: 15000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('INTERACTIVE_TERMINAL_REQUIRED');
    await expect(readFile(out)).rejects.toThrow();
  });
});

