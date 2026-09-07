import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 2 && args[0] === '--runtime-root'),
  'Usage: node test-mcp-protocol.mjs [--runtime-root ABSOLUTE_LANGUAGE_SERVER_DIR]'
);
const runtime = args.length
  ? args[1]
  : fileURLToPath(new URL('../language-server/', import.meta.url));
assert.ok(path.isAbsolute(runtime), '--runtime-root must be absolute');
await fs.access(path.join(runtime, 'package.json'));
const runtimeRequire = createRequire(path.join(runtime, 'package.json'));
for (const dependency of ['@modelcontextprotocol/sdk/client/index.js', 'vscode-jsonrpc/node']) {
  const resolved = runtimeRequire.resolve(dependency);
  assert.ok(
    resolved.startsWith(path.join(runtime, 'node_modules') + path.sep),
    `Dependency must be installed inside runtime: ${dependency}`
  );
}
const { Client } = runtimeRequire('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = runtimeRequire('@modelcontextprotocol/sdk/client/stdio.js');
const { createMessageConnection, StreamMessageReader, StreamMessageWriter } =
  runtimeRequire('vscode-jsonrpc/node');
const mcpEntry = path.join(runtime, 'dist', 'mcpServer.js');
const lspEntry = path.join(runtime, 'dist', 'server.js');
await fs.access(mcpEntry);
await fs.access(lspEntry);

const names = [
  'gofer_get_specs',
  'gofer_get_next_task',
  'gofer_execute_task',
  'gofer_update_task_status',
  'gofer_validate_code',
  'gofer_run_tests',
  'gofer_expand_observation',
  'gofer_get_context_health',
  'gofer_get_research_index',
  'gofer_load_research_chunk',
  'gofer_trigger_handoff',
  'gofer_peek_observation',
  'gofer_fold_observation',
  'gofer_grep_observations',
  'gofer_context_peek',
  'gofer_context_grep',
  'gofer_context_fold',
  'gofer_context_expand',
  'gofer_context_undo',
  'gofer_context_history',
  'gofer_check_slop',
  'gofer_context_repl',
  'gofer_check_workspace',
  'gofer_bootstrap_workspace',
  'gofer_get_pipeline_state',
  'gofer_start_stage',
  'gofer_validate_branch',
  'gofer_explain_eai_error',
  'gofer_open_artifact',
];
const safe = new Set([
  'gofer_get_specs',
  'gofer_get_next_task',
  'gofer_get_pipeline_state',
  'gofer_start_stage',
  'gofer_open_artifact',
]);
const fixtureArgs = {
  specId: '001-demo',
  taskId: 'T001',
  status: 'completed',
  files: ['docs/example.md'],
  observationId: 'obs-123',
  chunkId: 'chunk-001',
  foldLevel: 'summary',
  pattern: 'example',
  section: 'example',
  operations: [{ op: 'peek', target: 'example' }],
  codeOrReason: 'fixture',
  command: '0_gofer_start',
  path: 'docs/example.md',
};
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer protocol '));
const workspace = path.join(temp, 'workspace with spaces');
const decoy = path.join(temp, 'unrelated cwd');

async function write(relative, content) {
  const target = path.join(workspace, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function snapshot(dir) {
  const records = {};
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    records[entry.name] = entry.isSymbolicLink()
      ? await fs.readlink(target)
      : entry.isDirectory()
        ? await snapshot(target)
        : await fs.readFile(target, 'base64');
  }
  return records;
}

function bounded(promise, label, milliseconds = 10000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function sdkSession(flags, work) {
  const client = new Client({ name: 'gofer-protocol-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry, '--workspace-root', workspace, ...flags],
    cwd: decoy,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-16384);
  });
  try {
    await bounded(client.connect(transport), 'SDK initialize');
    assert.equal(client.getServerVersion()?.name, 'gofer');
    await work(client);
  } finally {
    await bounded(client.close(), `SDK close (${stderr})`);
  }
}

function payload(result) {
  assert.equal(result.isError, false, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}

function rawRpc(child) {
  let buffer = '';
  let id = 0;
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  const send = (message) =>
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  return {
    send,
    request(method, params) {
      const requestId = ++id;
      return bounded(
        new Promise((resolve) => {
          pending.set(requestId, resolve);
          send({ id: requestId, method, params });
        }),
        method
      );
    },
  };
}

async function waitUntil(check, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

async function childProcess(entry, childArgs, work) {
  const child = spawn(process.execPath, [entry, ...childArgs], {
    cwd: decoy,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-16384);
  });
  try {
    return await work(child, exited);
  } catch (error) {
    error.message += `\nChild stderr: ${stderr}`;
    throw error;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      try {
        await bounded(exited, 'Child termination', 2000);
      } catch {
        child.kill('SIGKILL');
        await bounded(exited, 'Child forced termination', 2000);
      }
    }
  }
}

try {
  await fs.mkdir(decoy);
  await write('docs/example.md', 'Bounded artifact fixture.\n');
  await write(
    '.specify/specs/001-demo/spec.md',
    '---\nfeature: Protocol Fixture\nstatus: ready\n---\nA fixture specification.\n'
  );
  await write('.specify/specs/001-demo/tasks.md', '- [ ] **T001**: Verify protocol\n');
  await write(
    '.specify/specs/001-demo/pipeline-state.json',
    '{"status":"in_progress","feature":"001-demo"}'
  );
  await write(
    '.specify/commands/0_gofer_start.md',
    '---\nname: 0_gofer_start\ndescription: Start fixture pipeline\n---\nFixture guidance.\n'
  );
  await write(
    '.specify/memory/context-health-state.json',
    '{"sections":{"example":"Fixture context"}}'
  );
  await write(
    '.specify/memory/observation-cache/index.json',
    '{"private":"MEMORY_SENTINEL_DO_NOT_DISCLOSE"}'
  );
  await write(
    '.specify/scripts/node/gofer-workspace-check.mjs',
    'import fs from "node:fs"; fs.writeFileSync("UNEXPECTED-EXECUTION", "spawned");'
  );
  await write('.env', 'DO_NOT_DISCLOSE');
  await write('docs/credentials.json', 'DO_NOT_DISCLOSE');

  await test(
    'SDK initialize, all 29 tools, bounded safe calls and main-stage aliases',
    { timeout: 30000 },
    async () => {
      const before = await snapshot(workspace);
      await sdkSession([], async (client) => {
        const listed = await client.listTools();
        assert.deepEqual(
          listed.tools.map((tool) => tool.name),
          names
        );
        assert.equal(
          listed.tools.filter((tool) => tool.annotations?.readOnlyHint).length,
          safe.size
        );
        assert.equal(
          payload(await client.callTool({ name: 'gofer_get_specs' })).specs[0].id,
          '001-demo'
        );
        assert.equal(
          payload(await client.callTool({ name: 'gofer_get_next_task' })).task.id,
          'T001'
        );
        assert.equal(
          payload(await client.callTool({ name: 'gofer_get_pipeline_state' })).active.feature,
          '001-demo'
        );
        for (const command of [
          '0_gofer_start',
          '/0_gofer_start',
          'eai-gofer:0_gofer_start',
          '$0_gofer_start',
        ]) {
          assert.equal(
            payload(await client.callTool({ name: 'gofer_start_stage', arguments: { command } }))
              .command,
            '/0_gofer_start'
          );
        }
        for (const artifact of [
          'docs/example.md',
          '.specify/specs/001-demo/spec.md',
          '.specify/commands/0_gofer_start.md',
        ]) {
          assert.ok(
            payload(
              await client.callTool({ name: 'gofer_open_artifact', arguments: { path: artifact } })
            ).content.length
          );
        }
        for (const tool of listed.tools.filter((tool) => !safe.has(tool.name))) {
          const argumentsForTool = Object.fromEntries(
            tool.inputSchema.required.map((name) => [name, fixtureArgs[name]])
          );
          const result = await client.callTool({ name: tool.name, arguments: argumentsForTool });
          assert.equal(result.isError, true, tool.name);
          assert.match(result.content[0].text, /Permission denied/, tool.name);
        }
        for (const argumentsForTool of [
          {},
          { path: 123 },
          { path: 'docs/example.md', maxBytes: -1 },
          { path: 'docs/example.md', maxBytes: 1.5 },
          { path: 'docs/example.md', maxBytes: 100001 },
          { path: 'docs/example.md', approved: true },
        ]) {
          await assert.rejects(
            client.callTool({ name: 'gofer_open_artifact', arguments: argumentsForTool }),
            (error) => error.code === -32602
          );
        }
        await assert.rejects(
          client.callTool({ name: 'does_not_exist' }),
          (error) => error.code === -32602
        );
        for (const artifact of [
          '.env',
          'docs/credentials.json',
          'docs/../../outside.md',
          '../outside.md',
          '/etc/passwd',
          'C:\\Windows\\win.ini',
          'docs/example.md:stream',
          '.specify/memory/context-health-state.json',
          'docs/../.specify/memory/observation-cache/index.json',
          '.specify/specs/../memory/observation-cache/index.json',
          'docs\\..\\.specify/memory/observation-cache/index.json',
        ]) {
          const result = await client.callTool({
            name: 'gofer_open_artifact',
            arguments: { path: artifact },
          });
          assert.equal(result.isError, true, artifact);
          assert.ok(!JSON.stringify(result).includes('DO_NOT_DISCLOSE'));
        }
        const missing = await client.callTool({
          name: 'gofer_open_artifact',
          arguments: { path: 'docs/missing.md' },
        });
        assert.equal(missing.isError, true);
      });
      assert.deepEqual(
        await snapshot(workspace),
        before,
        'Default tools must not write files or execute the repository helper'
      );
    }
  );

  await test(
    'Narrow write flag denies unqualified writes; explicit broad trust dispatches valid operations',
    { timeout: 15000 },
    async () => {
      await sdkSession(['--allow-write'], async (client) => {
        for (const name of [
          'gofer_get_research_index',
          'gofer_update_task_status',
          'gofer_check_workspace',
        ]) {
          const listed = await client.listTools();
          const tool = listed.tools.find((tool) => tool.name === name);
          const result = await client.callTool({
            name,
            arguments: Object.fromEntries(
              tool.inputSchema.required.map((key) => [key, fixtureArgs[key]])
            ),
          });
          assert.match(result.content[0].text, /Permission denied/);
        }
      });
      await sdkSession(['--allow-workspace-tools'], async (client) => {
        const result = payload(
          await client.callTool({
            name: 'gofer_context_repl',
            arguments: { operations: [{ op: 'peek', target: 'example' }] },
          })
        );
        assert.equal(result.results[0].success, true);
        assert.equal(result.results[0].message, 'Fixture context');
        await assert.rejects(
          client.callTool({
            name: 'gofer_context_repl',
            arguments: { operations: [{ op: 'arbitrary', target: 'example' }] },
          }),
          (error) => error.code === -32602
        );
      });
    }
  );

  await test(
    'Artifact byte limits and directory symlinks are enforced',
    { timeout: 15000 },
    async () => {
      await write('docs/large.md', 'x'.repeat(300000));
      const outside = path.join(temp, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'private.md'), 'DO_NOT_DISCLOSE');
      await fs.symlink(
        outside,
        path.join(workspace, 'docs', 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir'
      );
      try {
        await sdkSession([], async (client) => {
          const large = payload(
            await client.callTool({
              name: 'gofer_open_artifact',
              arguments: { path: 'docs/large.md', maxBytes: 17 },
            })
          );
          assert.equal(large.content.length, 17);
          assert.equal(large.bytes, 300000);
          assert.equal(large.truncated, true);
          const linked = await client.callTool({
            name: 'gofer_open_artifact',
            arguments: { path: 'docs/linked/private.md' },
          });
          assert.equal(linked.isError, true);
          assert.ok(!JSON.stringify(linked).includes('DO_NOT_DISCLOSE'));
        });
      } finally {
        await fs.rm(path.join(workspace, 'docs', 'linked'), { force: true });
      }
    }
  );

  await test(
    'Real JSON-RPC framing, unknown-method error and graceful MCP EOF shutdown',
    { timeout: 15000 },
    async () => {
      await childProcess(mcpEntry, ['--workspace-root', workspace], async (child, exited) => {
        let buffer = '';
        const pending = new Map();
        child.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          let newline;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const message = JSON.parse(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            pending.get(message.id)?.(message);
          }
        });
        const request = (id, method, params) =>
          bounded(
            new Promise((resolve) => {
              pending.set(id, resolve);
              child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
            }),
            method
          );
        const initialized = await request(1, 'initialize', {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'raw-fixture', version: '1' },
        });
        assert.ok(initialized.result.capabilities.tools);
        child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
        assert.equal((await request(2, 'fixture/unknown', {})).error.code, -32601);
        assert.equal((await request(3, 'tools/list', {})).result.tools.length, 29);
        child.stdin.end();
        const [code, signal] = await bounded(exited, 'MCP EOF shutdown', 3000);
        assert.equal(code, 0);
        assert.equal(signal, null, 'EOF shutdown must not require a kill signal');
        assert.equal(buffer, '');
      });
    }
  );

  await test(
    'LSP compatibility: initialize, legacy tool call, shutdown and exit',
    { timeout: 15000 },
    async () => {
      await childProcess(lspEntry, ['--stdio'], async (child, exited) => {
        const connection = createMessageConnection(
          new StreamMessageReader(child.stdout),
          new StreamMessageWriter(child.stdin)
        );
        connection.listen();
        try {
          const initialized = await bounded(
            connection.sendRequest('initialize', {
              processId: process.pid,
              capabilities: {},
              rootUri: pathToFileURL(workspace).href,
              workspaceFolders: [{ uri: pathToFileURL(workspace).href, name: 'fixture' }],
            }),
            'LSP initialize'
          );
          assert.deepEqual(
            initialized.capabilities.experimental.mcp.tools.map((tool) => tool.name),
            names
          );
          assert.ok(initialized.capabilities.textDocumentSync);
          await connection.sendNotification('initialized', {});
          const specs = payload(
            await bounded(
              connection.sendRequest('tools/call', { name: 'gofer_get_specs', arguments: {} }),
              'LSP tools/call'
            )
          );
          assert.equal(specs.specs[0].id, '001-demo');
          const unknown = await bounded(
            connection.sendRequest('tools/call', { name: 'unknown', arguments: {} }),
            'LSP error'
          );
          assert.equal(unknown.isError, true);
          await bounded(connection.sendRequest('shutdown'), 'LSP shutdown');
          await connection.sendNotification('exit');
          assert.equal((await bounded(exited, 'LSP exit', 3000))[0], 0);
        } finally {
          connection.dispose();
        }
      });
    }
  );

  await test(
    'In-flight MCP cancellation and EOF kill a SIGTERM-resistant direct child before cleanup',
    { timeout: 20000 },
    async () => {
      const pidFile = path.join(workspace, 'child.pid');
      const terminatedFile = path.join(workspace, 'child.term');
      await write(
        '.specify/scripts/node/gofer-workspace-check.mjs',
        'import fs from "node:fs"; process.on("SIGTERM", () => fs.writeFileSync("child.term", "received")); fs.writeFileSync("child.pid", String(process.pid)); setInterval(() => {}, 1000);'
      );
      for (const mode of ['cancel', 'eof']) {
        let pid;
        try {
          await fs.rm(pidFile, { force: true });
          await fs.rm(terminatedFile, { force: true });
          await childProcess(
            mcpEntry,
            ['--workspace-root', workspace, '--allow-write', '--allow-execution'],
            async (child, exited) => {
              const rpc = rawRpc(child);
              assert.ok(
                (
                  await rpc.request('initialize', {
                    protocolVersion: '2025-11-25',
                    capabilities: {},
                    clientInfo: { name: 'cancellation-fixture', version: '1' },
                  })
                ).result
              );
              rpc.send({ method: 'notifications/initialized' });
              rpc.send({
                id: 1000,
                method: 'tools/call',
                params: { name: 'gofer_check_workspace', arguments: {} },
              });
              await waitUntil(async () => {
                try {
                  pid = Number(await fs.readFile(pidFile, 'utf8'));
                  return Number.isSafeInteger(pid) && pid > 0;
                } catch {
                  return false;
                }
              }, 'Synthetic direct child did not start');
              const busy = await rpc.request('tools/call', { name: 'gofer_get_specs' });
              assert.match(busy.result.content[0].text, /busy/);
              if (mode === 'cancel')
                rpc.send({
                  method: 'notifications/cancelled',
                  params: { requestId: 1000, reason: 'Protocol test cancellation' },
                });
              else child.stdin.end();
              // This assertion happens BEFORE test teardown can send any kill signal.
              await waitUntil(() => {
                try {
                  process.kill(pid, 0);
                  return false;
                } catch (error) {
                  if (error.code === 'ESRCH') return true;
                  throw error;
                }
              }, 'MCP cancellation did not terminate its direct child');
              pid = undefined;
              if (process.platform !== 'win32')
                assert.equal(
                  await fs.readFile(terminatedFile, 'utf8'),
                  'received',
                  'Fixture must actually resist SIGTERM'
                );
              if (mode === 'cancel') {
                await waitUntil(async () => {
                  const response = await rpc.request('tools/call', { name: 'gofer_get_specs' });
                  return response.result.isError === false;
                }, 'Admission was not released after child close');
                child.stdin.end();
              }
              assert.equal((await bounded(exited, 'Cancelled MCP shutdown', 3000))[0], 0);
            }
          );
        } finally {
          // Failure recovery only; this cannot turn a failed cancellation assertion into a pass.
          if (pid)
            try {
              process.kill(pid, 'SIGKILL');
            } catch (error) {
              if (error.code !== 'ESRCH') throw error;
            }
        }
      }
    }
  );

  await test(
    'Missing/relative workspace roots fail closed without cwd inference',
    { timeout: 15000 },
    async () => {
      for (const startup of [
        [],
        ['--workspace-root', '.'],
        ['--workspace-root', path.join(temp, 'missing')],
        ['--approved'],
      ]) {
        await childProcess(mcpEntry, startup, async (child, exited) => {
          child.stdin.end();
          let stdout = '';
          child.stdout.on('data', (chunk) => {
            stdout += chunk;
          });
          assert.notEqual((await bounded(exited, 'Invalid startup'))[0], 0);
          assert.equal(stdout, '');
        });
      }
    }
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
