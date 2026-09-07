import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { MCPConfigHelper } from '../../../extension/src/mcpConfig';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn() },
  workspace: { isTrusted: true },
}));
vi.mock('fs/promises', async (original) => ({ ...(await original<typeof fs>()) }));
vi.mock('../../../extension/src/utils/logger', () => ({
  Logger: { for: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

describe('safe workspace MCP migration', () => {
  let root: string;
  let configPath: string;
  let helper: MCPConfigHelper;
  let context: vscode.ExtensionContext;
  const description = 'Gofer - Spec-driven development orchestrator';
  const legacy = (extra = {}) => ({
    type: 'stdio',
    command: 'node',
    args: [context.asAbsolutePath(path.join('language-server', 'dist', 'server.js'))],
    description,
    ...extra,
  });
  const currentArgs = () => [
    context.asAbsolutePath(path.join('language-server', 'dist', 'mcpServer.js')),
    '--workspace-root',
    root,
  ];
  const write = async (value: unknown) => {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(value));
  };
  const read = async () => JSON.parse(await fs.readFile(configPath, 'utf8'));

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace).isTrusted = true;
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-config-')));
    configPath = path.join(root, '.vscode', 'mcp.json');
    context = {
      asAbsolutePath: (file: string) => path.join(root, 'extension', file),
    } as vscode.ExtensionContext;
    helper = new MCPConfigHelper(root, context);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates only the dedicated server and explicit absolute workspace arguments', async () => {
    expect(await helper.autoSetup()).toBe(true);
    expect((await read()).servers.gofer).toEqual({
      type: 'stdio',
      command: 'node',
      args: currentArgs(),
      description,
    });
  });

  it.each(['top-level', 'legacy'])(
    'auto-migrates an existing %s entry and preserves env, inputs and other servers',
    async (location) => {
      const gofer = legacy({ env: { TOKEN: '${input:token}' }, timeout: 25 });
      const other = { command: 'custom', args: ['--keep'], env: { CUSTOM: 'yes' } };
      const inputs = [{ id: 'token', type: 'promptString', password: true }];
      await write(
        location === 'legacy'
          ? { inputs, mcp: { servers: { gofer, other }, extra: true } }
          : { inputs, servers: { gofer, other } }
      );
      expect(await helper.autoSetup()).toBe(true);
      const result = await read();
      expect(result.servers.gofer).toEqual({ ...gofer, args: currentArgs() });
      expect(result.inputs).toEqual(inputs);
      if (location === 'legacy') {
        expect(result.mcp).toEqual({ servers: { other }, extra: true });
      } else expect(result.servers.other).toEqual(other);
    }
  );

  it('removes a sole legacy Gofer entry and does not rewrite an already-current file', async () => {
    await write({ mcp: { servers: { gofer: legacy() } } });
    expect(await helper.autoSetup()).toBe(true);
    expect((await read()).mcp).toBeUndefined();
    const content = await fs.readFile(configPath, 'utf8');
    const spy = vi.spyOn(fs, 'writeFile');
    expect(await helper.autoSetup()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(await fs.readFile(configPath, 'utf8')).toBe(content);
  });

  it('preserves legacy metadata when its only server was Gofer', async () => {
    await write({ mcp: { servers: { gofer: legacy() }, inputs: [{ id: 'keep' }] } });
    await helper.createOrUpdateConfig();
    expect((await read()).mcp).toEqual({ inputs: [{ id: 'keep' }] });
  });

  it.each([
    { command: 'custom-gofer', args: [], env: { KEEP: 'true' } },
    { type: 'http', url: 'https://example.invalid/mcp' },
    {
      type: 'stdio',
      command: 'node',
      args: ['/custom/language-server/dist/server.js'],
      description,
    },
  ])('preserves custom Gofer configuration with an actionable error: %j', async (gofer) => {
    await write({ servers: { gofer }, inputs: [{ id: 'keep' }] });
    const before = await fs.readFile(configPath, 'utf8');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('custom Gofer entry');
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
    expect(await helper.autoSetup()).toBe(false);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining(configPath)
    );
  });

  it('preserves custom startup flags rather than adding or removing permissions', async () => {
    const gofer = legacy();
    gofer.args.push('--custom-permission');
    await write({ mcp: { servers: { gofer } } });
    const before = await fs.readFile(configPath, 'utf8');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('custom Gofer entry');
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
  });

  it('leaves an explicitly customized MCP permission flag untouched', async () => {
    await write({ servers: { gofer: legacy({ args: [...currentArgs(), '--allow-mutations'] }) } });
    const before = await fs.readFile(configPath, 'utf8');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('custom Gofer entry');
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
  });

  it('preserves other entries when adding Gofer to an existing file', async () => {
    const other = { command: 'another-server', env: { KEEP: 'yes' } };
    await write({ servers: { other }, mcp: { servers: { legacyOther: other } }, inputs: [] });
    await helper.createOrUpdateConfig();
    const result = await read();
    expect(result.servers.other).toEqual(other);
    expect(result.mcp.servers.legacyOther).toEqual(other);
    expect(result.inputs).toEqual([]);
    expect(result.servers.gofer.args).toEqual(currentArgs());
  });

  it('removes an identical generated duplicate without losing its environment', async () => {
    const gofer = legacy({ env: { KEEP: '${input:token}' } });
    await write({ servers: { gofer }, mcp: { servers: { gofer } } });
    await helper.createOrUpdateConfig();
    expect(await read()).toEqual({ servers: { gofer: { ...gofer, args: currentArgs() } } });
  });

  it('preserves a custom legacy Gofer entry even beside a generated top-level entry', async () => {
    await write({
      servers: { gofer: legacy() },
      mcp: { servers: { gofer: { command: 'keep-me' } } },
    });
    const before = await fs.readFile(configPath, 'utf8');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('custom Gofer entry');
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
  });

  it('does not overwrite a configuration created after the missing-file read', async () => {
    const originalMkdir = fs.mkdir;
    const mkdir = vi.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
      const result = await originalMkdir(...args);
      await fs.writeFile(configPath, '{"servers":{"custom":{"command":"keep-me"}}}');
      return result;
    });
    await expect(helper.createOrUpdateConfig()).rejects.toThrow(
      'Configuration changed during setup'
    );
    mkdir.mockRestore();
    expect(await read()).toEqual({ servers: { custom: { command: 'keep-me' } } });
  });

  it('does not overwrite conflicting top-level and legacy settings', async () => {
    await write({
      servers: { gofer: legacy({ env: { KEEP: 'a' } }) },
      mcp: { servers: { gofer: legacy({ env: { KEEP: 'b' } }) } },
    });
    const before = await fs.readFile(configPath, 'utf8');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('Reconcile');
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
  });

  it.each(['broken', 'null', '[]', '{"servers":[]}', '{"mcp":null}', '{"mcp":{"servers":false}}'])(
    'does not overwrite invalid configuration: %s',
    async (content) => {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, content);
      const spy = vi.spyOn(fs, 'writeFile');
      await expect(helper.createOrUpdateConfig()).rejects.toThrow('Repair');
      expect(spy).not.toHaveBeenCalled();
      expect(await fs.readFile(configPath, 'utf8')).toBe(content);
    }
  );

  it('does not treat an unreadable file as missing', async () => {
    const readSpy = vi
      .spyOn(fs, 'readFile')
      .mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const writeSpy = vi.spyOn(fs, 'writeFile');
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('Check its permissions');
    expect(writeSpy).not.toHaveBeenCalled();
    readSpy.mockRestore();
  });

  it('migrates an older installed extension path and the prior stdio workaround', async () => {
    await write({
      servers: {
        gofer: legacy({
          args: [
            path.join(
              root,
              '.vscode',
              'extensions',
              'enterpriseai.gofer-3.10.0',
              'language-server',
              'dist',
              'server.js'
            ),
            '--stdio',
          ],
        }),
      },
    });
    await helper.createOrUpdateConfig();
    expect((await read()).servers.gofer.args).toEqual(currentArgs());
  });

  it('rejects a relative workspace rather than using the process cwd', async () => {
    const relative = path.relative(process.cwd(), root);
    await expect(new MCPConfigHelper(relative, context).createOrUpdateConfig()).rejects.toThrow(
      'absolute path'
    );
    await expect(fs.stat(configPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['directory', 'file', 'dangling-file'])(
    'preserves a linked configuration %s and its target',
    async (kind) => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-outside-'));
      const target = path.join(outside, 'mcp.json');
      const original = JSON.stringify({ servers: { gofer: legacy() } });
      try {
        if (kind !== 'dangling-file') await fs.writeFile(target, original);
        if (kind === 'directory') {
          await fs.symlink(
            outside,
            path.dirname(configPath),
            process.platform === 'win32' ? 'junction' : 'dir'
          );
        } else {
          await fs.mkdir(path.dirname(configPath));
          await fs.symlink(target, configPath, 'file');
        }
        const open = vi.spyOn(fs, 'open');
        await expect(helper.createOrUpdateConfig()).rejects.toThrow('symbolic link');
        expect(open).not.toHaveBeenCalled();
        expect(
          (
            await fs.lstat(kind === 'directory' ? path.dirname(configPath) : configPath)
          ).isSymbolicLink()
        ).toBe(true);
        if (kind === 'dangling-file')
          await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
        else expect(await fs.readFile(target, 'utf8')).toBe(original);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    }
  );

  it.each(['create', 'auto'])('requires trust before %s setup reads or writes', async (mode) => {
    vi.mocked(vscode.workspace).isTrusted = false;
    const open = vi.spyOn(fs, 'open');
    const read = vi.spyOn(fs, 'readFile');
    if (mode === 'auto') {
      expect(await helper.autoSetup()).toBe(false);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('workspace trust')
      );
    } else await expect(helper.createOrUpdateConfig()).rejects.toThrow('workspace trust');
    expect(open).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('checks trust again after asynchronous filesystem work', async () => {
    const original = fs.mkdir;
    vi.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
      const result = await original(...args);
      vi.mocked(vscode.workspace).isTrusted = false;
      return result;
    });
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('workspace trust');
    await expect(fs.stat(configPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['edit', 'replace', 'symlink'])(
    'refuses a config %s between reading and opening',
    async (kind) => {
      await write({ servers: { gofer: legacy() } });
      const originalMkdir = fs.mkdir;
      const replacement = '{"servers":{"personal":{"command":"keep-me"}}}';
      vi.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
        const result = await originalMkdir(...args);
        if (kind !== 'edit') await fs.rename(configPath, `${configPath}.original`);
        if (kind === 'symlink') await fs.symlink(`${configPath}.original`, configPath, 'file');
        else await fs.writeFile(configPath, replacement);
        return result;
      });
      const open = vi.spyOn(fs, 'open');
      await expect(helper.createOrUpdateConfig()).rejects.toThrow(
        kind === 'symlink' ? 'symbolic link' : 'Configuration changed'
      );
      expect(open).not.toHaveBeenCalled();
      if (kind !== 'symlink') expect(await fs.readFile(configPath, 'utf8')).toBe(replacement);
      else expect((await fs.lstat(configPath)).isSymbolicLink()).toBe(true);
    }
  );

  it('refuses a directory swapped to a link during setup', async () => {
    await write({ servers: { gofer: legacy() } });
    const original = await fs.readFile(configPath, 'utf8');
    const originalMkdir = fs.mkdir;
    vi.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
      const result = await originalMkdir(...args);
      const directory = path.dirname(configPath);
      await fs.rename(directory, `${directory}-original`);
      await fs.symlink(
        `${directory}-original`,
        directory,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
      return result;
    });
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('symbolic link');
    expect(await fs.readFile(configPath, 'utf8')).toBe(original);
  });

  it('detects replacement at file open without truncating the replacement', async () => {
    await write({ servers: { gofer: legacy() } });
    const originalOpen = fs.open;
    const replacement = '{"personal":"keep"}';
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      await fs.rename(configPath, `${configPath}.original`);
      await fs.writeFile(configPath, replacement);
      return originalOpen(...args);
    });
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('Configuration changed');
    expect(await fs.readFile(configPath, 'utf8')).toBe(replacement);
  });

  it('compares descriptor content as well as file identity before migrating', async () => {
    const stale = JSON.stringify({ servers: { gofer: legacy() } });
    const personal = '{"personal":"preserve this newer content"}';
    await fs.mkdir(path.dirname(configPath));
    await fs.writeFile(configPath, personal);
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(stale);
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('Configuration changed');
    expect(await fs.readFile(configPath, 'utf8')).toBe(personal);
  });

  it('closes the descriptor without writing if trust changes after opening', async () => {
    await write({ servers: { gofer: legacy() } });
    const content = await fs.readFile(configPath, 'utf8');
    const originalOpen = fs.open;
    const closed = vi.fn();
    const written = vi.fn();
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      const readFile = handle.readFile.bind(handle);
      const close = handle.close.bind(handle);
      vi.spyOn(handle, 'readFile').mockImplementation(async (...readArgs) => {
        const result = await readFile(...readArgs);
        vi.mocked(vscode.workspace).isTrusted = false;
        return result;
      });
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        closed();
        await close();
      });
      vi.spyOn(handle, 'write').mockImplementation(async () => {
        written();
        throw new Error('unexpected write');
      });
      return handle;
    });
    await expect(helper.createOrUpdateConfig()).rejects.toThrow('workspace trust');
    expect(written).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
    expect(await fs.readFile(configPath, 'utf8')).toBe(content);
  });

  it('rejects an empty workspace without writing configuration', async () => {
    const spy = vi.spyOn(fs, 'writeFile');
    await expect(new MCPConfigHelper(' ', context).createOrUpdateConfig()).rejects.toThrow(
      'explicit Gofer workspace'
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the repository MCP launch explicit and safe by default', async () => {
    const config = JSON.parse(
      await fs.readFile(new URL('../../../.vscode/mcp.json', import.meta.url), 'utf8')
    );
    expect(config.servers.gofer.args).toEqual([
      '${workspaceFolder}/language-server/dist/mcpServer.js',
      '--workspace-root',
      '${workspaceFolder}',
    ]);
    expect(config.servers.gofer.env).toBeUndefined();
  });
});
