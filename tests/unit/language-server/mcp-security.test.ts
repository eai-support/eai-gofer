import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MCPToolHandler,
  assertMcpWorkspaceTrusted,
  resolveWorkspaceTrust,
  sanitizeMcpDiagnostic,
} from '../../../language-server/src/mcp/toolHandler.js';

const temporaryDirectories: string[] = [];

function createHandler(workspace: string, serverDir?: string): MCPToolHandler {
  const handler = new MCPToolHandler(workspace, {
    sendNotification: () => undefined,
  } as never);
  if (serverDir) {
    Reflect.set(handler, 'getServerDir', () => serverDir);
  }
  return handler;
}

async function createPackagedScriptLayout(): Promise<{
  extensionRoot: string;
  scriptsRoot: string;
  serverDir: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-package-'));
  temporaryDirectories.push(root);
  const extensionRoot = path.join(root, 'extension');
  const scriptsRoot = path.join(extensionRoot, 'resources', 'node-scripts');
  const serverDir = path.join(extensionRoot, 'language-server', 'dist', 'mcp');
  await fs.mkdir(scriptsRoot, { recursive: true });
  await fs.mkdir(serverDir, { recursive: true });
  await fs.writeFile(
    path.join(extensionRoot, 'package.json'),
    JSON.stringify({ name: 'gofer', publisher: 'EnterpriseAI' }),
    'utf8'
  );
  return { extensionRoot, scriptsRoot, serverDir };
}

afterEach(async () => {
  delete process.env.GOFER_TEST_SECRET;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe('MCP security boundaries', () => {
  it('starts the language server only in a trusted VS Code workspace and propagates trust', async () => {
    const [manifestSource, clientSource] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'extension', 'package.json'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'extension', 'src', 'lspClient.ts'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestSource) as {
      capabilities?: { untrustedWorkspaces?: { supported?: unknown } };
    };

    expect(manifest.capabilities?.untrustedWorkspaces?.supported).toBe(false);
    expect(clientSource).toMatch(
      /initializationOptions:\s*{\s*workspaceTrusted:\s*vscode\.workspace\.isTrusted\s*===\s*true/
    );
  });

  it('fails closed for executing or mutating tools unless trust is explicitly true', () => {
    expect(resolveWorkspaceTrust(undefined)).toBe(false);
    expect(resolveWorkspaceTrust({ workspaceTrusted: 'true' })).toBe(false);
    expect(resolveWorkspaceTrust({ workspaceTrusted: true })).toBe(true);

    expect(() => assertMcpWorkspaceTrusted('gofer_bootstrap_workspace', false)).toThrow(
      /requires a trusted workspace/
    );
    expect(() => assertMcpWorkspaceTrusted('gofer_run_tests', false)).toThrow(
      /requires a trusted workspace/
    );
    expect(() => assertMcpWorkspaceTrusted('gofer_bootstrap_workspace', true)).not.toThrow();
    expect(() => assertMcpWorkspaceTrusted('gofer_open_artifact', false)).not.toThrow();
  });

  it('executes only the extension-packaged workspace checker with an isolated environment', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-workspace-'));
    temporaryDirectories.push(workspace);
    const { scriptsRoot, serverDir } = await createPackagedScriptLayout();
    const marker = path.join(workspace, 'workspace-script-ran');
    const workspaceScript = path.join(
      workspace,
      '.specify',
      'scripts',
      'node',
      'gofer-workspace-check.mjs'
    );
    await fs.mkdir(path.dirname(workspaceScript), { recursive: true });
    await fs.writeFile(
      workspaceScript,
      `await import('node:fs/promises').then((fs) => fs.writeFile(${JSON.stringify(marker)}, 'pwned'));\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(scriptsRoot, 'gofer-workspace-check.mjs'),
      [
        "const workspace = process.argv[process.argv.indexOf('--workspace') + 1];",
        'process.stderr.write(`token=top-secret ${workspace}\\n`);',
        "process.stdout.write(JSON.stringify({ status: 'current', source: 'packaged', workspace, environmentLeak: process.env.GOFER_TEST_SECRET ?? 'absent' }));",
      ].join('\n'),
      'utf8'
    );
    process.env.GOFER_TEST_SECRET = 'must-not-reach-script';

    const result = await createHandler(workspace, serverDir).checkWorkspace('codex');

    expect(result).toMatchObject({
      success: true,
      source: 'packaged',
      workspace: '<local-path>',
      environmentLeak: 'absent',
    });
    expect(String(result.stderr)).toContain('token=<redacted>');
    expect(String(result.stderr)).not.toContain('top-secret');
    expect(String(result.stderr)).not.toContain(workspace);
    await expect(fs.access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a packaged checker symlink that escapes the extension resource root', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-workspace-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-outside-'));
    temporaryDirectories.push(workspace, outside);
    const { scriptsRoot, serverDir } = await createPackagedScriptLayout();
    await fs.writeFile(
      path.join(outside, 'gofer-workspace-check.mjs'),
      "process.stdout.write('{}');\n",
      'utf8'
    );
    await fs.rm(scriptsRoot, { recursive: true });
    await fs.symlink(outside, scriptsRoot, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(createHandler(workspace, serverDir).checkWorkspace('codex')).rejects.toThrow(
      /resource root must not be a symbolic link/
    );
  });

  it('does not follow an in-workspace artifact symlink to a secret outside the workspace', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-workspace-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-mcp-secret-'));
    temporaryDirectories.push(workspace, outside);
    await fs.writeFile(path.join(outside, 'secret.txt'), 'do-not-disclose', 'utf8');
    await fs.symlink(
      outside,
      path.join(workspace, 'external'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const result = await createHandler(workspace).openArtifact('external/secret.txt');

    expect(result).toMatchObject({ success: false, error: 'path contains a symbolic link' });
    expect(JSON.stringify(result)).not.toContain('do-not-disclose');
  });

  it('redacts credentials and local paths from diagnostics', () => {
    const workspace = path.join(os.tmpdir(), 'private-workspace');
    const output = sanitizeMcpDiagnostic(
      `Bearer abc.def token=hunter2 password=secret ${workspace}/file.txt`,
      [workspace]
    );

    expect(output).not.toContain('abc.def');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('password=secret');
    expect(output).not.toContain(workspace);
  });
});
