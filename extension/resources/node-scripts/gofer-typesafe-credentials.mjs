#!/usr/bin/env node

import { constants } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const SECRET_RELATIVE_PATH = path.join('.specify', 'secrets', 'typesafe.env');
const POLICY_RELATIVE_PATH = path.join('.specify', 'config', 'typesafe-semantic-review.json');

function parseArgs(argv) {
  const action = argv.find((value) => value === '--connect' || value === '--disconnect' || value === '--status');
  if (!action || argv.length !== 1) throw new Error('Usage: --connect | --disconnect | --status');
  return action.slice(2);
}

// A lexical check alone does not stop a symlinked intermediate directory
// (e.g. .specify/secrets) from redirecting the confined path outside the
// workspace. Walk every component from the workspace root and reject any
// that is a symlink, matching gofer-surface-update.mjs's existing check.
async function assertNoSymlinkComponents(root, relativeTarget) {
  const components = relativeTarget.split(path.sep).filter(Boolean);
  let currentPath = root;
  for (const component of components) {
    currentPath = path.join(currentPath, component);
    try {
      const status = await fs.lstat(currentPath);
      if (status.isSymbolicLink()) {
        throw new Error('Gofer credential path must not pass through a symbolic link.');
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function confinedPath(workspace, relativePath) {
  const root = path.resolve(workspace);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Gofer credential path must remain inside the workspace.');
  }
  await assertNoSymlinkComponents(root, relative);
  return target;
}

async function existingFile(target) {
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Gofer credential path must be a regular file.');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

// O_NOFOLLOW is unavailable on Windows; the bitwise OR silently contributes
// nothing there rather than erroring. lstat detects a symlink or junction
// cross-platform (including Windows) and is the actual protection;
// O_NOFOLLOW only closes the small remaining gap between that check and the
// open, on platforms that support it.
const noFollowFlag = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
async function assertNotSymlink(target) {
  const info = await fs.lstat(target).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error('Gofer credential path must not be a symbolic link.');
}

// The static confinement check happens before the caller ever opens the file;
// a same-account process could still swap a symlink in between. The lstat
// check immediately before opening, plus O_NOFOLLOW where available, closes
// that window instead of merely trusting the earlier confinedPath check.
async function readNoFollow(target) {
  await assertNotSymlink(target);
  const handle = await fs.open(target, constants.O_RDONLY | noFollowFlag);
  try { return await handle.readFile('utf8'); } finally { await handle.close(); }
}

async function writeNoFollow(target, content, mode) {
  await assertNotSymlink(target);
  const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollowFlag, mode);
  try { await handle.writeFile(content); } finally { await handle.close(); }
}

async function readSecretFile(secretPath) {
  if (!(await existingFile(secretPath))) return '';
  const match = (await readNoFollow(secretPath)).match(/^TYPESAFE_API_KEY=([^\r\n]+)$/m);
  return match?.[1]?.trim() || '';
}

async function writePolicyEnabled(workspace, enabled) {
  const policyPath = await confinedPath(workspace, POLICY_RELATIVE_PATH);
  const current = JSON.parse(await readNoFollow(policyPath));
  current.enabled = enabled;
  await writeNoFollow(policyPath, `${JSON.stringify(current, null, 2)}\n`, 0o600);
}

async function promptForKey() {
  if (!process.stdin.isTTY) throw new Error('Set TYPESAFE_API_KEY, then run --connect from an interactive terminal.');
  process.stdout.write('TypeSafe API key: ');
  const key = await new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk) => {
      const character = chunk.toString('utf8');
      if (character === '\r' || character === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(value);
      } else if (character === '\u0003') {
        process.stdin.setRawMode(false);
        reject(new Error('Credential setup cancelled.'));
      } else if (character === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    });
  });
  return String(key).trim();
}

export async function credentialStatus({ workspace = process.cwd(), env = process.env } = {}) {
  const { source } = await resolveApiKey({ workspace, env });
  return {
    configured: source !== 'none',
    source,
    secretPath: SECRET_RELATIVE_PATH,
  };
}

export async function resolveApiKey({ workspace = process.cwd(), env = process.env } = {}) {
  const environmentKey = String(env.TYPESAFE_API_KEY || '').trim();
  if (environmentKey) return { apiKey: environmentKey, source: 'environment' };
  const fileKey = await readSecretFile(await confinedPath(workspace, SECRET_RELATIVE_PATH));
  return { apiKey: fileKey, source: fileKey ? 'project_secret_file' : 'none' };
}

export async function connect({ workspace = process.cwd(), key } = {}) {
  const secretPath = await confinedPath(workspace, SECRET_RELATIVE_PATH);
  const resolvedKey = String(key || process.env.TYPESAFE_API_KEY || '').trim() || await promptForKey();
  if (!resolvedKey) throw new Error('TypeSafe API key cannot be empty.');
  await fs.mkdir(path.dirname(secretPath), { recursive: true, mode: 0o700 });
  if (await existingFile(secretPath)) await fs.chmod(secretPath, 0o600);
  await writeNoFollow(secretPath, `TYPESAFE_API_KEY=${resolvedKey}\n`, 0o600);
  await fs.chmod(secretPath, 0o600);
  await writePolicyEnabled(workspace, true);
  return { configured: true, source: process.env.TYPESAFE_API_KEY ? 'environment' : 'project_secret_file', secretPath: SECRET_RELATIVE_PATH };
}

export async function disconnect({ workspace = process.cwd() } = {}) {
  const secretPath = await confinedPath(workspace, SECRET_RELATIVE_PATH);
  const existed = await existingFile(secretPath);
  if (existed) await fs.unlink(secretPath);
  await writePolicyEnabled(workspace, false);
  return { removedProjectSecret: existed, environmentStillConfigured: Boolean(process.env.TYPESAFE_API_KEY), secretPath: SECRET_RELATIVE_PATH };
}

async function main() {
  const action = parseArgs(process.argv.slice(2));
  const result = action === 'connect' ? await connect() : action === 'disconnect' ? await disconnect() : await credentialStatus();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
