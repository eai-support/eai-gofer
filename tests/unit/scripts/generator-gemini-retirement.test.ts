import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const generatorUrl = new URL(
  '../../../.specify/scripts/node/generate-commands.mjs',
  import.meta.url
);
const directory = '.gemini/commands/gofer';
const generated = new Map([
  [
    'eai.md',
    '# Eai\n\n## User-Facing Contract\n<!-- gofer:always-on-eai:start -->\nnode .specify/scripts/node/gofer-workspace-check.mjs --host gemini --json\n\nMy local note must survive.\n',
  ],
  [
    'eai-update.md',
    '## Update EAI Gofer\n\n## Update Contract\nnode <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action inspect --host gemini --json\n',
  ],
  [
    'eai.toml',
    'description = "Start or continue the EAI delivery pipeline."\nprompt = "{{include: ./eai.md}}"\n',
  ],
  [
    'eai-update.toml',
    'description = "Install or update EAI Gofer for this AI coding app."\nprompt = "{{include: ./eai-update.md}}"\n',
  ],
  [
    'manifest.json',
    '{"version":"1.0","generated":"2026-09-05T22:36:59.353Z","commands":["eai","eai-update"]}\n',
  ],
]);

describe('safe retirement of generated Gemini commands', () => {
  let root: string;
  let retire: (
    root: string,
    options?: { dryRun?: boolean }
  ) => Promise<{
    found: string[];
    preserved: string[];
    archived: string[];
    archiveRoot: string | null;
  }>;

  async function write(relative: string, content: string) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }

  async function snapshot(relative = ''): Promise<unknown[]> {
    const result: unknown[] = [];
    for (const entry of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const nested = path.join(relative, entry.name);
      if (entry.isDirectory()) result.push([nested, await snapshot(nested)]);
      else if (entry.isSymbolicLink())
        result.push([nested, await fs.readlink(path.join(root, nested))]);
      else
        result.push([
          nested,
          await fs.readFile(path.join(root, nested), 'utf8'),
          (await fs.stat(path.join(root, nested))).mtimeMs,
        ]);
    }
    return result;
  }

  async function seed() {
    for (const [name, content] of generated) await write(`${directory}/${name}`, content);
  }

  function cli(flag: '--check' | '--dry-run') {
    return spawnSync(process.execPath, [fileURLToPath(generatorUrl), '--root', root, flag], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  }

  beforeAll(async () => {
    retire = (await import(generatorUrl.href)).retireLegacyGeminiCommands;
  });
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-retire-gemini-'));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([`${directory}/eai.md`, '.gemini/agents/reviewer.md', '.claude/agents/reviewer.md'])(
    'does not read or archive a file replaced after opening: %s',
    async (relative) => {
      await write(`${directory}/eai.md`, generated.get('eai.md')!);
      await write('.gemini/agents/reviewer.md', '# Reviewer\n');
      await write('.claude/agents/reviewer.md', '# Reviewer\n');
      const target = path.join(root, relative);
      const open = fs.open.bind(fs);
      const reads = vi.fn();
      const closes = vi.fn();
      vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const handle = await open(...args);
        if (args[0] === target) {
          const read = handle.read.bind(handle);
          const close = handle.close.bind(handle);
          vi.spyOn(handle, 'read').mockImplementation((...readArgs) => {
            reads();
            return read(...readArgs);
          });
          vi.spyOn(handle, 'close').mockImplementation(() => {
            closes();
            return close();
          });
          await fs.rename(target, `${target}.original`);
          await fs.writeFile(target, 'Private replacement must not be read');
        }
        return handle;
      });
      const report = await retire(root);
      const candidate = relative.startsWith('.claude/') ? '.gemini/agents/reviewer.md' : relative;
      expect(report.preserved).toContain(candidate);
      expect(report.archived).not.toContain(candidate);
      expect(reads).not.toHaveBeenCalled();
      expect(closes).toHaveBeenCalledOnce();
      expect(await fs.readFile(target, 'utf8')).toBe('Private replacement must not be read');
    }
  );

  it.each(['linked', 'oversized', 'special', 'growing'])(
    'preserves a %s descriptor without an unbounded read',
    async (problem) => {
      const relative = `${directory}/eai.md`;
      await write(relative, generated.get('eai.md')!);
      const target = path.join(root, relative);
      const open = fs.open.bind(fs);
      const reads = vi.fn();
      const closes = vi.fn();
      vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const handle = await open(...args);
        if (args[0] === target) {
          const stat = await handle.stat();
          vi.spyOn(handle, 'stat').mockResolvedValue(
            Object.assign(
              stat,
              problem === 'linked'
                ? { nlink: 2 }
                : problem === 'oversized'
                  ? { size: 16 * 1024 * 1024 + 1 }
                  : problem === 'special'
                    ? { isFile: () => false }
                    : {}
            )
          );
          const read = handle.read.bind(handle);
          const close = handle.close.bind(handle);
          vi.spyOn(handle, 'read').mockImplementation((...readArgs) => {
            reads();
            return read(...readArgs);
          });
          vi.spyOn(handle, 'close').mockImplementation(() => {
            closes();
            return close();
          });
          if (problem === 'growing') await fs.appendFile(target, 'appended after descriptor check');
        }
        return handle;
      });
      expect((await retire(root)).preserved).toEqual([relative]);
      if (problem === 'growing') expect(reads).toHaveBeenCalledOnce();
      else expect(reads).not.toHaveBeenCalled();
      expect(closes).toHaveBeenCalledOnce();
      expect(await fs.readFile(target, 'utf8')).toContain(generated.get('eai.md'));
    }
  );

  it('archives only known generated files and preserves local edits in the backup', async () => {
    await seed();
    const unrelated = new Map([
      [`${directory}/custom.toml`, 'prompt = "user command"\n'],
      [`${directory}/nested/eai.md`, '# Nested user file\n'],
      ['.gemini/settings.json', '{"custom":true}\n'],
      ['.gemini/skills/custom/SKILL.md', '# User skill\n'],
      ['GEMINI.md', '# Keep workspace context\n'],
    ]);
    for (const [relative, content] of unrelated) await write(relative, content);
    const result = await retire(root);
    expect(result.preserved).toEqual([]);
    expect([...result.archived].sort()).toEqual(
      [...generated.keys()].map((name) => `${directory}/${name}`).sort()
    );
    expect(result.archiveRoot).toContain('.specify/logs/legacy-command-backups/gemini-');
    for (const [name, content] of generated) {
      await expect(fs.access(path.join(root, directory, name))).rejects.toThrow();
      expect(await fs.readFile(path.join(result.archiveRoot!, name), 'utf8')).toBe(content);
    }
    for (const [relative, content] of unrelated)
      expect(await fs.readFile(path.join(root, relative), 'utf8')).toBe(content);
    const after = await snapshot();
    expect((await retire(root)).found).toEqual([]);
    expect(await snapshot()).toEqual(after);
  });

  it('dry-run reports every leftover without any filesystem changes', async () => {
    await seed();
    const before = await snapshot();
    const report = await retire(root, { dryRun: true });
    expect(report.found).toHaveLength(5);
    expect(report.archived).toEqual([]);
    expect(report.archiveRoot).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it('does nothing when there is no legacy command tree', async () => {
    expect(await retire(root)).toEqual({
      found: [],
      preserved: [],
      archived: [],
      archiveRoot: null,
    });
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('archives byte-identical agents without a commands directory, preserving edited and unknown files', async () => {
    const canonical = '# Reviewer\nRead-only checks.\n';
    await write('.claude/agents/reviewer.md', canonical);
    await write('.gemini/agents/reviewer.md', canonical);
    await write('.claude/agents/edited.md', canonical);
    await write('.gemini/agents/edited.md', canonical + 'User changes.\n');
    await write('.gemini/agents/unknown.md', '# User agent\n');
    await write('.gemini/agents/nested/reviewer.md', canonical);
    const report = await retire(root);
    expect(report.archived).toEqual(['.gemini/agents/reviewer.md']);
    expect(report.preserved).toEqual(['.gemini/agents/edited.md']);
    expect(report.found).not.toContain('.gemini/agents/unknown.md');
    await expect(fs.access(path.join(root, '.gemini/agents/reviewer.md'))).rejects.toThrow();
    expect(await fs.readFile(path.join(report.archiveRoot!, 'agents/reviewer.md'), 'utf8')).toBe(
      canonical
    );
    expect(await fs.readFile(path.join(root, '.claude/agents/reviewer.md'), 'utf8')).toBe(
      canonical
    );
    expect(await fs.readFile(path.join(root, '.gemini/agents/edited.md'), 'utf8')).toBe(
      canonical + 'User changes.\n'
    );
    expect(await fs.readFile(path.join(root, '.gemini/agents/unknown.md'), 'utf8')).toBe(
      '# User agent\n'
    );
    expect(await fs.readFile(path.join(root, '.gemini/agents/nested/reviewer.md'), 'utf8')).toBe(
      canonical
    );
    const after = await snapshot();
    expect((await retire(root)).archived).toEqual([]);
    expect(await snapshot()).toEqual(after);
  });

  it('keeps agent and command backups distinct when their names match', async () => {
    await seed();
    await write('.claude/agents/eai.md', '# Canonical agent\n');
    await write('.gemini/agents/eai.md', '# Canonical agent\n');
    const before = await snapshot();
    const preview = await retire(root, { dryRun: true });
    expect(preview.found).toHaveLength(6);
    expect(preview.archived).toEqual([]);
    expect(await snapshot()).toEqual(before);
    const report = await retire(root);
    expect(report.archived).toHaveLength(6);
    expect(await fs.readFile(path.join(report.archiveRoot!, 'agents/eai.md'), 'utf8')).toBe(
      '# Canonical agent\n'
    );
    expect(await fs.readFile(path.join(report.archiveRoot!, 'eai.md'), 'utf8')).toBe(
      generated.get('eai.md')
    );
  });

  it('does not normalize agent bytes or guess ownership without a canonical agent directory', async () => {
    await write('.gemini/agents/reviewer.md', '# Reviewer\r\n');
    const before = await snapshot();
    expect((await retire(root)).found).toEqual([]);
    expect(await snapshot()).toEqual(before);
    await write('.claude/agents/reviewer.md', '# Reviewer\n');
    const report = await retire(root);
    expect(report.preserved).toEqual(['.gemini/agents/reviewer.md']);
    expect(report.archived).toEqual([]);
    expect(await fs.readFile(path.join(root, '.gemini/agents/reviewer.md'), 'utf8')).toBe(
      '# Reviewer\r\n'
    );
  });

  it.skipIf(process.platform === 'win32').each(['.gemini/agents', '.claude/agents'])(
    'preserves symlink agent files in %s',
    async (directory) => {
      await write('outside.md', '# Reviewer\n');
      await write('.gemini/agents/reviewer.md', '# Reviewer\n');
      await write('.claude/agents/reviewer.md', '# Reviewer\n');
      const linked = path.join(root, directory, 'reviewer.md');
      await fs.unlink(linked);
      await fs.symlink(path.join(root, 'outside.md'), linked);
      const before = await snapshot();
      expect((await retire(root)).preserved).toEqual(['.gemini/agents/reviewer.md']);
      expect(await snapshot()).toEqual(before);
    }
  );

  it.skipIf(process.platform === 'win32').each(['.gemini/agents', '.claude/agents'])(
    'refuses symlink agent directory %s before archiving any commands',
    async (directory) => {
      await seed();
      await fs.mkdir(path.join(root, '.gemini/agents'), { recursive: true });
      await fs.mkdir(path.join(root, '.claude/agents'), { recursive: true });
      await fs.mkdir(path.join(root, 'external'));
      await fs.rmdir(path.join(root, directory));
      await fs.symlink(path.join(root, 'external'), path.join(root, directory), 'dir');
      const before = await snapshot();
      await expect(retire(root)).rejects.toThrow(/Preserved non-directory or symlink/);
      expect(await snapshot()).toEqual(before);
    }
  );

  it('CLI check detects agent-only leftovers without changing them', async () => {
    await write('.claude/agents/reviewer.md', '# Reviewer\n');
    await write('.gemini/agents/reviewer.md', '# Reviewer\n');
    await fs.mkdir(path.join(root, '.specify/commands'), { recursive: true });
    const before = await snapshot();
    const check = cli('--check');
    expect(check.status).toBe(1);
    expect(check.stdout).toContain('would archive .gemini/agents/reviewer.md');
    expect(check.stderr).toContain('Retired Gemini CLI files remain');
    const dryRun = cli('--dry-run');
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('would archive .gemini/agents/reviewer.md');
    expect(await snapshot()).toEqual(before);
  });

  it('preserves unrecognised contents even at known generated filenames', async () => {
    for (const name of generated.keys())
      await write(`${directory}/${name}`, 'User-owned replacement\n');
    const before = await snapshot();
    const result = await retire(root);
    expect(result.preserved).toEqual(result.found);
    expect(result.preserved).toHaveLength(5);
    expect(result.archiveRoot).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['eai.toml', generated.get('eai.toml')! + 'custom = true\n'],
    ['manifest.json', '{"version":"1.0","generated":"2026-09-05","commands":["eai","custom"]}'],
    [
      'manifest.json',
      '{"version":"1.0","generated":"2026-09-05","commands":["eai","eai-update"],"custom":true}',
    ],
    ['manifest.json', '{"version":"1.0","generated":"invalid","commands":["eai","eai-update"]}'],
  ])('keeps edited or invalid %s for manual review', async (name, content) => {
    await write(`${directory}/${name}`, content);
    expect((await retire(root)).preserved).toEqual([`${directory}/${name}`]);
    expect(await fs.readFile(path.join(root, directory, name), 'utf8')).toBe(content);
  });

  it('preserves directories at a known file path instead of recursively removing them', async () => {
    await write(`${directory}/eai.md/private.md`, 'User content\n');
    expect((await retire(root)).preserved).toEqual([`${directory}/eai.md`]);
    expect(await fs.readFile(path.join(root, directory, 'eai.md/private.md'), 'utf8')).toBe(
      'User content\n'
    );
  });

  it.skipIf(process.platform === 'win32')('does not follow symlink files', async () => {
    await write('outside.md', generated.get('eai.md')!);
    await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.symlink(path.join(root, 'outside.md'), path.join(root, directory, 'eai.md'));
    const before = await snapshot();
    expect((await retire(root)).preserved).toEqual([`${directory}/eai.md`]);
    expect(await snapshot()).toEqual(before);
  });

  it
    .skipIf(process.platform === 'win32')
    .each(['.gemini', '.gemini/commands', directory, '.specify/logs'])(
    'refuses symlink directory %s without moving files',
    async (relative) => {
      if (relative === '.specify/logs') await seed();
      await fs.mkdir(path.join(root, 'external'), { recursive: true });
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await fs.symlink(path.join(root, 'external'), path.join(root, relative), 'dir');
      const before = await snapshot();
      await expect(retire(root)).rejects.toThrow(/Preserved non-directory or symlink/);
      expect(await snapshot()).toEqual(before);
    }
  );

  it('CLI check fails on leftovers and dry-run previews retirement without writes', async () => {
    await seed();
    await fs.mkdir(path.join(root, '.specify/commands'), { recursive: true });
    const before = await snapshot();
    const check = cli('--check');
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('Retired Gemini CLI files remain');
    for (const name of generated.keys()) expect(check.stdout).toContain(`${directory}/${name}`);
    expect(await snapshot()).toEqual(before);
    const dryRun = cli('--dry-run');
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout.match(/would archive/g)).toHaveLength(5);
    expect(await snapshot()).toEqual(before);
    await retire(root);
    const clean = await snapshot();
    expect(cli('--check').status).toBe(0);
    expect(await snapshot()).toEqual(clean);
  });

  it('CLI check reports unrecognised leftovers without deleting them', async () => {
    await write(`${directory}/eai.md`, '# User-owned command\n');
    await fs.mkdir(path.join(root, '.specify/commands'), { recursive: true });
    const before = await snapshot();
    const check = cli('--check');
    expect(check.status).toBe(1);
    expect(check.stdout).toContain('preserved for manual review');
    expect(await snapshot()).toEqual(before);
  });
});
