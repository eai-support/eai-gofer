import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractVsix as extractArchive, parseArguments, runProtocol,
  testPackagedProtocol as checkPackage, validateEntry } from '../../../scripts/test-packaged-protocol.mjs';

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: vi.fn(),
}));

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = path.join(root, 'scripts/test-packaged-protocol.mjs');
const require = createRequire(path.join(root, 'package.json'));
// Use the ZIP library owned by the root's declared test tooling, not extension dependencies.
const JSZip = createRequire(require.resolve('@vscode/test-electron'))('jszip');
const temporary: string[] = [];

// Only the ZIP-reader boundary is substituted. The extraction, validation, writes,
// process handoff and cleanup remain production code. CI also runs real yauzl on a VSIX.
const zipReader = {
  open(filename, _options, callback) {
    (async () => {
      const archive = await JSZip.loadAsync(await readFile(filename), { checkCRC32: true });
      const entries = [];
      for (const file of Object.values(archive.files) as any[]) {
        const data = await file.async('nodebuffer');
        entries.push({ fileName: file.unsafeOriginalName ?? file.name,
          externalFileAttributes: (file.unixPermissions ?? 0) << 16,
          generalPurposeBitFlag: 0, uncompressedSize: data.length, data });
      }
      const reader = Object.assign(new EventEmitter(), {
        isOpen: true,
        readEntry() {
          const entry = entries.shift();
          queueMicrotask(() => reader.emit(entry ? 'entry' : 'end', entry));
        },
        openReadStream(entry, done) { done(null, Readable.from(entry.data)); },
        close() {
          reader.isOpen = false;
          queueMicrotask(() => reader.emit('close'));
        },
      });
      callback(null, reader);
    })().catch(callback);
  },
};
const extractVsix = (vsix, destination) => extractArchive(vsix, destination, { zipReader });
const testPackagedProtocol = (args, options = {}) => checkPackage(args, { ...options, zipReader });

async function fixture(entries: Record<string, string> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gofer-package-test-'));
  temporary.push(directory);
  const vsix = path.join(directory, 'fixture with spaces.vsix');
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content, { createFolders: false });
  await writeFile(vsix, await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }));
  return { directory, vsix };
}

const runtimePrefix = 'extension/language-server/';
function runtimeEntries() {
  return {
    [`${runtimePrefix}package.json`]: JSON.stringify({ dependencies: { '@fixture/runtime': '1.0.0' } }),
    [`${runtimePrefix}dist/server.js`]: '// Synthetic fixture, not a protocol server.',
    [`${runtimePrefix}dist/mcpServer.js`]: '// Synthetic fixture, not a protocol server.',
    [`${runtimePrefix}node_modules/@fixture/runtime/package.json`]: '{"name":"@fixture/runtime"}',
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('packaged protocol validation', () => {
  it.each([[], ['--vsix'], ['--other', 'x'], ['--vsix', 'x', 'extra'], ['--vsix', '--other']])(
    'rejects invalid arguments %j', async (...args) => {
      await expect(parseArguments(args)).rejects.toThrow('Usage:');
    });

  it('accepts existing absolute and relative paths, including spaces', async () => {
    const { directory, vsix } = await fixture();
    expect(await parseArguments(['--vsix', vsix])).toBe(vsix);
    expect(await parseArguments(['--vsix', path.basename(vsix)], directory)).toBe(vsix);
    await expect(parseArguments(['--vsix', directory])).rejects.toThrow('must be a file');
    await expect(parseArguments(['--vsix', path.join(directory, 'missing.vsix')])).rejects.toThrow('ENOENT');
  });

  it('returns a nonzero CLI exit for missing arguments and missing paths', () => {
    for (const args of [[], ['--vsix', path.join(os.tmpdir(), 'absent-gofer-vsix', 'missing.vsix')]]) {
      const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Packaged protocol validation failed:');
      expect(result.stdout).not.toContain('passed');
    }
  });

  it.each(['../escape', '/absolute', 'C:/escape', 'a/../../escape', 'a\\escape',
    'a//b', './entry', 'a/./b', 'a\u0000b', 'a/file:stream', 'a/trailing.', 'a/NUL.txt']) (
    'rejects unsafe ZIP entry %j', (fileName) => {
      expect(() => validateEntry({ fileName, externalFileAttributes: 0, generalPurposeBitFlag: 0 },
        os.tmpdir(), new Set())).toThrow('Unsafe ZIP entry');
    });

  it('rejects links, encrypted entries and case-insensitive duplicates', () => {
    const entry = { fileName: 'extension/file', externalFileAttributes: 0, generalPurposeBitFlag: 0 };
    expect(() => validateEntry({ ...entry, externalFileAttributes: 0o120777 << 16 }, os.tmpdir(), new Set()))
      .toThrow('links are forbidden');
    expect(() => validateEntry({ ...entry, generalPurposeBitFlag: 1 }, os.tmpdir(), new Set()))
      .toThrow('Encrypted');
    const seen = new Set();
    validateEntry(entry, os.tmpdir(), seen);
    expect(() => validateEntry({ ...entry, fileName: 'Extension/File' }, os.tmpdir(), seen)).toThrow('duplicate');
  });

  it('extracts ZIP fixture data through the isolated reader without relying on a shell', async () => {
    const { directory, vsix } = await fixture({ 'extension/data.json': '{"value":42}' });
    const destination = path.join(directory, 'extracted');
    await extractVsix(vsix, destination);
    expect(await readFile(path.join(destination, 'extension/data.json'), 'utf8')).toBe('{"value":42}');
  });

  it.each(['traversal', 'symlink', 'corrupt'])(
    'rejects an actual %s archive without running the protocol and cleans up', async (kind) => {
      const { directory, vsix } = await fixture({ 'safe/file.txt': 'payload' });
      let archive = await readFile(vsix);
      if (kind === 'traversal') {
        const original = Buffer.from('safe/file.txt');
        for (let offset = archive.indexOf(original); offset !== -1; offset = archive.indexOf(original, offset + original.length)) {
          Buffer.from('../escape.txt').copy(archive, offset);
        }
      } else if (kind === 'symlink') {
        const centralHeader = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        archive.writeUInt32LE((0o120777 << 16) >>> 0, centralHeader + 38);
      } else {
        archive = Buffer.from('not a zip');
      }
      await writeFile(vsix, archive);
      vi.spyOn(os, 'tmpdir').mockReturnValue(directory);
      const protocolRunner = vi.fn();
      await expect(testPackagedProtocol(['--vsix', vsix], { protocolRunner })).rejects.toThrow();
      expect(protocolRunner).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([path.basename(vsix)]);
    });

  it('hands the extracted runtime to the real protocol script using Node without a shell', async () => {
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValueOnce(child as ReturnType<typeof spawn>);
    const options = { runtimeRoot: path.join(os.tmpdir(), 'package/extension/language-server'),
      cwd: path.join(os.tmpdir(), 'package/protocol-workspace'), env: { PATH: process.env.PATH } };
    const running = runProtocol(options);
    expect(spawn).toHaveBeenCalledWith(process.execPath,
      [path.join(root, 'scripts/test-mcp-protocol.mjs'), '--runtime-root', options.runtimeRoot],
      { cwd: options.cwd, env: options.env, stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL' });
    child.emit('close', 0, null);
    await expect(running).resolves.toBeUndefined();
  });

  it.each(['exit', 'signal', 'spawn-error'])('fails when the protocol child reports %s', async (failure) => {
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValueOnce(child as ReturnType<typeof spawn>);
    const running = runProtocol({ runtimeRoot: os.tmpdir(), cwd: os.tmpdir(), env: {} });
    if (failure === 'spawn-error') child.emit('error', new Error('cannot spawn'));
    else child.emit('close', failure === 'exit' ? 2 : null, failure === 'signal' ? 'SIGKILL' : null);
    await expect(running).rejects.toThrow();
  });

  it('runs a synthetic runner outside the checkout with an isolated runtime and cleans up', async () => {
    const { vsix } = await fixture(runtimeEntries());
    vi.stubEnv('NODE_PATH', path.join(root, 'node_modules'));
    vi.stubEnv('NODE_OPTIONS', '--require checkout-preload');
    let extracted = '';
    const protocolRunner = vi.fn(async ({ runtimeRoot, cwd, env }) => {
      extracted = path.dirname(path.dirname(runtimeRoot));
      expect(runtimeRoot).toBe(path.join(extracted, 'extension/language-server'));
      expect(cwd).toBe(path.join(extracted, 'protocol-workspace'));
      expect(cwd.startsWith(root)).toBe(false);
      expect(existsSync(cwd)).toBe(true);
      expect(existsSync(path.join(runtimeRoot, 'dist/mcpServer.js'))).toBe(true);
      expect(Object.keys(env).some((key) => ['NODE_PATH', 'NODE_OPTIONS'].includes(key.toUpperCase()))).toBe(false);
    });
    await testPackagedProtocol(['--vsix', vsix], { protocolRunner });
    expect(protocolRunner).toHaveBeenCalledOnce();
    expect(existsSync(extracted)).toBe(false);
  });

  it('propagates protocol failures and still removes the extracted runtime', async () => {
    const { vsix } = await fixture(runtimeEntries());
    let extracted = '';
    await expect(testPackagedProtocol(['--vsix', vsix], {
      protocolRunner: async ({ runtimeRoot }) => {
        extracted = path.dirname(path.dirname(runtimeRoot));
        throw new Error('protocol child failed');
      },
    })).rejects.toThrow('protocol child failed');
    expect(existsSync(extracted)).toBe(false);
  });

  it.each(['dist/mcpServer.js', 'dist/server.js', 'package.json', 'node_modules/@fixture/runtime/package.json'])(
    'fails before protocol execution when packaged %s is missing', async (missing) => {
      const entries = runtimeEntries();
      delete entries[`${runtimePrefix}${missing}`];
      const { directory, vsix } = await fixture(entries);
      vi.spyOn(os, 'tmpdir').mockReturnValue(directory);
      const protocolRunner = vi.fn();
      await expect(testPackagedProtocol(['--vsix', vsix], { protocolRunner })).rejects.toThrow();
      expect(protocolRunner).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([path.basename(vsix)]);
    });

  it.each([undefined, {}, [], 'invalid'])(
    'rejects absent or malformed production dependency declarations %j', async (dependencies) => {
      const entries = runtimeEntries();
      entries[`${runtimePrefix}package.json`] = JSON.stringify({ dependencies });
      const { vsix } = await fixture(entries);
      const protocolRunner = vi.fn();
      await expect(testPackagedProtocol(['--vsix', vsix], { protocolRunner }))
        .rejects.toThrow('must declare production dependencies');
      expect(protocolRunner).not.toHaveBeenCalled();
    });

  it.each(['../escape', '@scope/..', '/absolute', 'C:\\escape'])(
    'rejects unsafe production dependency name %j', async (name) => {
      const entries = runtimeEntries();
      entries[`${runtimePrefix}package.json`] = JSON.stringify({ dependencies: { [name]: '1.0.0' } });
      const { vsix } = await fixture(entries);
      const protocolRunner = vi.fn();
      await expect(testPackagedProtocol(['--vsix', vsix], { protocolRunner }))
        .rejects.toThrow('Invalid packaged dependency name');
      expect(protocolRunner).not.toHaveBeenCalled();
    });

  it('checks every production dependency, without accepting a same-named dev dependency', async () => {
    const entries = runtimeEntries();
    entries[`${runtimePrefix}package.json`] = JSON.stringify({
      dependencies: { '@fixture/runtime': '1.0.0', 'missing-production-dependency': '1.0.0' },
      devDependencies: { 'missing-production-dependency': '1.0.0' },
    });
    const { vsix } = await fixture(entries);
    const protocolRunner = vi.fn();
    await expect(testPackagedProtocol(['--vsix', vsix], { protocolRunner }))
      .rejects.toThrow('Missing packaged production dependency: missing-production-dependency');
    expect(protocolRunner).not.toHaveBeenCalled();
  });
});
