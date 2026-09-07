#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const checkoutRoot = path.resolve(path.dirname(scriptPath), '..');
const extensionRequire = createRequire(path.join(checkoutRoot, 'extension/package.json'));
const usage = 'Usage: node scripts/test-packaged-protocol.mjs --vsix <existing-file.vsix>';

export async function parseArguments(args, cwd = process.cwd()) {
  if (args.length !== 2 || args[0] !== '--vsix' || !args[1] || args[1].startsWith('--')) {
    throw new Error(usage);
  }
  const vsix = path.resolve(cwd, args[1]);
  if (!(await stat(vsix)).isFile()) throw new Error(`VSIX must be a file: ${vsix}`);
  return vsix;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateEntry(entry, destination, seen) {
  const name = entry.fileName;
  const directory = name.endsWith('/');
  const parts = (directory ? name.slice(0, -1) : name).split('/');
  // Reject Windows aliases too, so an archive has the same meaning on every host.
  if (!name || /[\\\x00-\x1f\x7f:]/.test(name) || parts.some((part) =>
    !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe ZIP entry: ${name}`);
  }
  const type = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (type !== 0 && type !== (directory ? 0o040000 : 0o100000)) {
    throw new Error(`Unsupported ZIP entry type (links are forbidden): ${name}`);
  }
  if (entry.generalPurposeBitFlag & 1) throw new Error(`Encrypted ZIP entry: ${name}`);
  const target = path.resolve(destination, ...parts);
  const key = parts.join('/').toLowerCase();
  if (!isWithin(destination, target) || seen.has(key)) throw new Error(`Unsafe or duplicate ZIP entry: ${name}`);
  seen.add(key);
  return { target, directory };
}

export async function extractVsix(vsix, destination, { zipReader } = {}) {
  const yauzl = zipReader ?? extensionRequire('yauzl');
  const zip = await new Promise((resolve, reject) => {
    yauzl.open(vsix, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (error, archive) => error ? reject(error) : resolve(archive));
  });
  const abort = new AbortController();
  zip.on('error', (error) => abort.abort(error));
  const seen = new Set();
  let totalBytes = 0;
  try {
    while (true) {
      abort.signal.throwIfAborted();
      const entry = await new Promise((resolve, reject) => {
        const cleanup = () => {
          zip.off('entry', onEntry);
          zip.off('end', onEnd);
          zip.off('error', onError);
        };
        const onEntry = (value) => { cleanup(); resolve(value); };
        const onEnd = () => { cleanup(); resolve(null); };
        const onError = (error) => { cleanup(); reject(error); };
        zip.once('entry', onEntry);
        zip.once('end', onEnd);
        zip.once('error', onError);
        zip.readEntry();
      });
      if (!entry) break;
      const { target, directory } = validateEntry(entry, destination, seen);
      totalBytes += entry.uncompressedSize;
      if (seen.size > 100000 || totalBytes > 2 * 1024 ** 3) throw new Error('VSIX exceeds extraction limits');
      if (directory) {
        await mkdir(target, { recursive: true });
      } else {
        await mkdir(path.dirname(target), { recursive: true });
        const stream = await new Promise((resolve, reject) => {
          zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value));
        });
        await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal: abort.signal });
      }
    }
  } finally {
    if (zip.isOpen) {
      await new Promise((resolve) => {
        zip.once('close', resolve);
        zip.close();
      });
    }
  }
}

export async function validateRuntime(runtimeRoot) {
  for (const relative of ['package.json', 'dist/server.js', 'dist/mcpServer.js']) {
    const target = path.join(runtimeRoot, relative);
    if (!(await stat(target)).isFile()) throw new Error(`Missing packaged runtime file: ${relative}`);
  }
  const manifest = JSON.parse(await readFile(path.join(runtimeRoot, 'package.json'), 'utf8'));
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object' ||
      Array.isArray(manifest.dependencies) || Object.keys(manifest.dependencies).length === 0) {
    throw new Error('Packaged language server must declare production dependencies');
  }
  for (const dependency of Object.keys(manifest.dependencies)) {
    if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(dependency) ||
        dependency.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error(`Invalid packaged dependency name: ${dependency}`);
    }
    const target = path.join(runtimeRoot, 'node_modules', dependency, 'package.json');
    if (!(await stat(target).catch(() => null))?.isFile()) {
      throw new Error(`Missing packaged production dependency: ${dependency}`);
    }
  }
}

export function runProtocol({ runtimeRoot, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(checkoutRoot, 'scripts/test-mcp-protocol.mjs'),
      '--runtime-root', runtimeRoot], { cwd, env, stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Packaged protocol check failed (${signal || `exit ${code}`})`));
    });
  });
}

export async function testPackagedProtocol(args, { protocolRunner = runProtocol, zipReader } = {}) {
  const vsix = await parseArguments(args);
  const temporaryRoot = await realpath(os.tmpdir());
  if (isWithin(await realpath(checkoutRoot), temporaryRoot)) {
    throw new Error('OS temporary directory must be outside the checkout');
  }
  const temporary = await mkdtemp(path.join(temporaryRoot, 'gofer-packaged-protocol-'));
  try {
    await extractVsix(vsix, temporary, { zipReader });
    const runtimeRoot = path.join(temporary, 'extension/language-server');
    await validateRuntime(runtimeRoot);
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (['NODE_PATH', 'NODE_OPTIONS'].includes(key.toUpperCase())) delete env[key];
    }
    // Keep the test workspace separate from the unpacked application runtime.
    const cwd = path.join(temporary, 'protocol-workspace');
    await mkdir(cwd);
    await protocolRunner({ runtimeRoot, cwd, env });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  testPackagedProtocol(process.argv.slice(2)).then(() => {
    console.log('Packaged MCP/LSP protocol checks passed (not native desktop qualification).');
  }).catch((error) => {
    console.error(`Packaged protocol validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
