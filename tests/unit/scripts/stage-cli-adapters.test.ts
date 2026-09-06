import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn as spawnNative } from 'node:child_process';
import { tmpdir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';
import path from 'node:path';
import {
  createCliStageAdapter,
  codexStageExecutionArgs,
  resultReader,
} from '../../../.specify/scripts/node/lib/stage-cli-adapters.mjs';
import { aggregateUsage } from '../../../.specify/scripts/node/lib/portable-orchestration.mjs';
import { executeStage } from '../../../.specify/scripts/node/lib/stage-execution.mjs';

// Malformed native protocol fixtures deliberately allow fields of any shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;
type FakeChild = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  pid?: number;
};
type Call = {
  command: string;
  args: string[];
  options: Message;
  child: FakeChild;
  messages: Message[];
  send: (message: Message) => void;
  close: (code?: number) => void;
};
type Behavior = {
  launch?: (call: Call) => boolean | void;
  request?: (message: Message, call: Call) => boolean | void;
  entries?: Message[];
  events?: Message[];
  fragment?: boolean;
};

// Generic transport tests simulate Linux on every runner. Windows resolution
// has explicit synthetic PATH/exists coverage below and never needs installed CLIs.
const fakeOptions = { platform: 'linux', env: { PATH: '/synthetic/bin', HOME: '/synthetic/home' } };

// Explicit, opt-in native release qualification. Never auto-discover an installed
// CLI in unit tests. The fake provider is loopback-only and needs no credentials.
const nativeCodex = process.env.GOFER_CODEX_NATIVE_TEST;

async function nativeText(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  input: string
) {
  const child = spawnNative(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let bytes = 0;
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      stdout += chunk;
      if (bytes > 1_048_576) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      stderr += chunk;
      if (bytes > 1_048_576) child.kill('SIGKILL');
    });
    child.stdin.on('error', () => {});
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    child.stdin.end(input);
    const code = await closed;
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

it.skipIf(!nativeCodex)(
  'qualifies native Codex read isolation against a local fake provider (release gate)',
  async () => {
    expect(path.isAbsolute(nativeCodex!)).toBe(true);
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-codex-native-test-'));
    try {
      const args = codexStageExecutionArgs('gpt-5.4');
      // A synthetic provider exercises the installed built-in registry, not live
      // account/model availability. Keep all production safety switches unchanged.
      args[args.indexOf('--model') + 1] = 'gpt-5.4';
      const version = await nativeText(
        nativeCodex!,
        ['--version'],
        root,
        { PATH: process.env.PATH, HOME: root, CODEX_HOME: root },
        ''
      );
      expect(version.code).toBe(0);
      const observations: Message[] = [];
      for (const kind of ['normal', 'wrong-context', 'valid-edit', 'delete', 'move-inward']) {
        const directory = path.join(root, kind);
        const cwd = path.join(directory, 'workspace');
        const home = path.join(directory, 'home');
        const outside = path.join(directory, 'outside', 'protected.txt');
        const moved = path.join(cwd, 'moved.txt');
        const secret = 'SYNTHETIC_PROTECTED_CONTENT_9c4f83';
        const globalInstructions = 'SYNTHETIC_HOME_INSTRUCTIONS_827a11';
        const parentInstructions = 'SYNTHETIC_PARENT_INSTRUCTIONS_933e22';
        const original = `known header\n${secret}\nknown footer\n`;
        await mkdir(cwd, { recursive: true });
        await mkdir(home);
        await mkdir(path.dirname(outside));
        await writeFile(outside, original);
        await writeFile(path.join(home, 'AGENTS.md'), globalInstructions);
        await writeFile(path.join(directory, 'AGENTS.md'), parentInstructions);
        const requests: Message[] = [];
        const patch =
          kind === 'delete'
            ? `*** Begin Patch\n*** Delete File: ${outside}\n*** End Patch`
            : `*** Begin Patch\n*** Update File: ${outside}\n${kind === 'move-inward' ? `*** Move to: ${moved}\n` : ''}@@\n-${kind === 'wrong-context' ? 'absent header' : 'known header'}\n+edited header\n*** End Patch`;
        const server = createServer(async (request, response) => {
          try {
            let body = Buffer.concat(await Array.fromAsync(request));
            if (request.headers['content-encoding'] === 'zstd') body = zstdDecompressSync(body);
            requests.push(JSON.parse(body.toString()));
            if (requests.length > 2) {
              response.writeHead(500).end();
              return;
            }
            const tool = kind !== 'normal' && requests.length === 1;
            const item = tool
              ? {
                  type: 'custom_tool_call',
                  id: 'ct_probe',
                  call_id: 'call_probe',
                  name: 'apply_patch',
                  input: patch,
                  status: 'completed',
                }
              : {
                  type: 'message',
                  id: 'msg_probe',
                  role: 'assistant',
                  status: 'completed',
                  content: [{ type: 'output_text', text: 'Probe complete.', annotations: [] }],
                };
            const event = (type: string, value: Message) =>
              `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
            response.writeHead(200, { 'Content-Type': 'text/event-stream' });
            response.end(
              event('response.output_item.done', { output_index: 0, item }) +
                event('response.completed', {
                  response: {
                    id: `probe-${requests.length}`,
                    status: 'completed',
                    output: [item],
                    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
                  },
                })
            );
          } catch {
            response.writeHead(500).end();
          }
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
          const address = server.address();
          if (!address || typeof address === 'string') throw new Error('No loopback port');
          const provider = [
            'model_provider="probe"',
            `model_providers.probe={name="Local probe",base_url="http://127.0.0.1:${address.port}/v1",wire_api="responses",requires_openai_auth=false}`,
            'analytics.enabled=false',
            'check_for_update_on_startup=false',
          ];
          const result = await nativeText(
            nativeCodex!,
            [...args.slice(0, -1), ...provider.flatMap((value) => ['-c', value]), '-'],
            cwd,
            {
              PATH: process.env.PATH,
              HOME: home,
              CODEX_HOME: home,
              SYSTEMROOT: process.env.SYSTEMROOT,
              GOFER_STAGE_DELEGATE: '1',
              CI: '1',
              NO_COLOR: '1',
            },
            'Use only the supplied prompt. Return a bounded answer.'
          );
          const payloads = JSON.stringify(requests);
          const toolOutputs = requests.flatMap((request) =>
            (request.input ?? []).filter((item: Message) => item.type === 'custom_tool_call_output')
          );
          observations.push({
            kind,
            exitCode: result.code,
            requests: requests.length,
            tools: requests[0]?.tools?.map((tool: Message) => tool.name),
            outsideUnchanged: (await readFile(outside, 'utf8').catch(() => null)) === original,
            movedCreated: existsSync(moved),
            protectedTextSent: payloads.includes(secret),
            globalInstructionsSent: payloads.includes(globalInstructions),
            parentInstructionsSent: payloads.includes(parentInstructions),
            contextReadBeforeRejection: JSON.stringify(toolOutputs).includes(
              'Failed to find expected lines'
            ),
            writeRejected: JSON.stringify(toolOutputs).includes(
              'writing is blocked by read-only sandbox'
            ),
            toolEventReported: result.stdout.includes('"type":"file_change"'),
          });
        } finally {
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          );
        }
      }
      console.info(
        'Native Codex isolation qualification:',
        JSON.stringify({ version: version.stdout.trim(), observations })
      );
      // This intentionally remains a failing release gate while native controls
      // leak global context or validate outside file contents before rejection.
      expect(
        observations.every(
          (value) => value.exitCode === 0 && value.requests === (value.kind === 'normal' ? 1 : 2)
        )
      ).toBe(true);
      expect(
        observations.every(
          (value) =>
            value.outsideUnchanged &&
            !value.movedCreated &&
            !value.protectedTextSent &&
            !value.parentInstructionsSent
        )
      ).toBe(true);
      expect(
        observations.some(
          (value) => value.globalInstructionsSent || value.contextReadBeforeRejection
        ),
        'Native Codex still reads or sends unselected files'
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  35_000
);

function fixture(host: string, behavior: Behavior = {}) {
  const calls: Call[] = [];
  const nativeId = 'future-model-a';
  const spawn = vi.fn((command: string, args: string[], options: Message) => {
    let closed = false;
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => {
        close();
        return true;
      }),
    }) as FakeChild;
    const close = (code = 0) => {
      if (!closed) {
        closed = true;
        child.emit('close', code);
      }
    };
    const rpc = args.includes('--headless');
    const codexCatalog = args.includes('app-server');
    const claudeCatalog = host === 'claude' && !args.includes('--model');
    const send = (message: Message) => {
      const json = JSON.stringify(message);
      const body = Buffer.from(
        rpc ? `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}` : `${json}\n`
      );
      if (behavior.fragment) {
        for (let index = 0; index < body.length; index += 3)
          child.stdout.write(body.subarray(index, index + 3));
      } else child.stdout.write(body);
    };
    const call: Call = { command, args, options, child, messages: [], send, close };
    calls.push(call);
    let incoming = Buffer.alloc(0);
    const handle = (message: Message) => {
      call.messages.push(message);
      if (behavior.request?.(message, call)) return;
      const response = (result: Message) =>
        send({ ...(rpc ? { jsonrpc: '2.0' } : {}), id: message.id, result });
      if (codexCatalog) {
        if (message.method === 'initialize') response({ userAgent: 'fixture' });
        if (message.method === 'account/read')
          response({
            requiresOpenaiAuth: true,
            account: { type: 'chatgpt', token: 'DO_NOT_EXPOSE' },
          });
        if (message.method === 'model/list')
          response({
            data: (behavior.entries ?? [{ id: nativeId }]).map((m, index) => ({
              ...m,
              id: `ui:${m.id}`,
              model: m.id,
              hidden: false,
              isDefault: index === 0,
              supportedReasoningEfforts: [],
            })),
            nextCursor: null,
          });
      } else if (claudeCatalog) {
        send({
          type: 'control_response',
          response: {
            request_id: 'catalog',
            subtype: 'success',
            response: {
              models: (behavior.entries ?? [{ id: nativeId }]).map((m) => ({ ...m, value: m.id })),
            },
          },
        });
      } else if (rpc) {
        if (message.method === 'ping') response({ protocolVersion: 3 });
        if (message.method === 'auth.getStatus')
          response({ isAuthenticated: true, authType: 'gh-cli' });
        if (message.method === 'models.list')
          response({
            models: behavior.entries ?? [
              {
                id: nativeId,
                policy: { state: 'enabled' },
                capabilities: { family: 'native-family' },
              },
            ],
          });
        if (message.method === 'session.create') response({ sessionId: message.params.sessionId });
        if (message.method === 'session.send') {
          response({ messageId: 'message-id' });
          for (const event of behavior.events ?? [
            { type: 'assistant.message', data: { content: 'A bounded answer', model: nativeId } },
            {
              type: 'assistant.usage',
              data: { inputTokens: 12, cacheReadTokens: 3, outputTokens: 4 },
            },
            { type: 'session.idle', data: {} },
          ])
            send({
              jsonrpc: '2.0',
              method: 'session.event',
              params: { sessionId: message.params.sessionId, event },
            });
        }
      }
    };
    child.stdin.on('data', (chunk: Buffer) => {
      if (!rpc && !codexCatalog && !claudeCatalog) {
        if (host === 'claude') call.messages.push(JSON.parse(chunk.toString()));
        return;
      }
      incoming = Buffer.concat([incoming, chunk]);
      while (incoming.length) {
        if (rpc) {
          const split = incoming.indexOf('\r\n\r\n');
          if (split < 0) break;
          const size = Number(
            /Content-Length: (\d+)/.exec(incoming.subarray(0, split).toString())?.[1]
          );
          if (incoming.length < split + 4 + size) break;
          const message = JSON.parse(incoming.subarray(split + 4, split + 4 + size).toString());
          incoming = incoming.subarray(split + 4 + size);
          queueMicrotask(() => handle(message));
        } else {
          const split = incoming.indexOf(10);
          if (split < 0) break;
          const message = JSON.parse(incoming.subarray(0, split).toString());
          incoming = incoming.subarray(split + 1);
          queueMicrotask(() => handle(message));
        }
      }
    });
    queueMicrotask(() => {
      if (behavior.launch?.(call)) return;
      if (rpc || codexCatalog || claudeCatalog) return;
      if (args[0] === 'models') {
        child.stdout.write(
          host === 'grok'
            ? `You are logged in with grok.com.\n\nDefault model: ${nativeId}\n\nAvailable models:\n  * ${nativeId} (default)\n  - future-model-b\n`
            : `${nativeId}\tFuture Model\nclaude-future\tClaude Future\n`
        );
      } else {
        const events =
          behavior.events ??
          (host === 'codex'
            ? [
                {
                  type: 'item.completed',
                  item: { type: 'agent_message', text: 'A bounded answer' },
                },
                {
                  type: 'turn.completed',
                  usage: { input_tokens: 12, cached_input_tokens: 3, output_tokens: 4 },
                },
              ]
            : [
                {
                  type: 'assistant',
                  message: {
                    model: nativeId,
                    content: [{ type: 'text', text: 'A bounded answer' }],
                  },
                },
                {
                  type: 'result',
                  subtype: 'success',
                  result: 'A bounded answer',
                  usage: {
                    input_tokens: 12,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 3,
                    output_tokens: 4,
                  },
                  total_cost_usd: 0.02,
                },
              ]);
        for (const event of events) send(event);
      }
      close();
    });
    return child;
  });
  const adapter = createCliStageAdapter(host, { ...fakeOptions, spawn });
  const decode = () => {
    const reader = resultReader(host, nativeId, { maxOutputBytes: 65_536 });
    for (const event of behavior.events ?? []) reader.event(event);
    return reader.result();
  };
  return { adapter, spawn, calls, nativeId, decode };
}

describe('native CLI stage discovery', () => {
  it.each(['codex', 'claude', 'copilot', 'grok', 'antigravity'])(
    'reads %s current native catalog without inference',
    async (host) => {
      const f = fixture(host, { fragment: true });
      const result = await f.adapter.discover({});
      expect(result).toMatchObject({
        host,
        surface: 'cli',
        verified: true,
        readOnlyIsolation: !['antigravity', 'codex'].includes(host),
        models: [
          expect.objectContaining({ id: f.nativeId, available: true, nativeCompound: false }),
          ...(host === 'grok' || host === 'antigravity' ? [expect.any(Object)] : []),
        ],
      });
      expect(result.observedAtMs).toBeGreaterThan(Date.now() - 10_000);
      expect(f.calls).toHaveLength(1);
      expect(JSON.stringify(f.calls[0].messages)).not.toMatch(
        /session.create|session.send|turn.start/
      );
      expect(f.calls[0].options).toMatchObject({
        shell: false,
        detached: true,
        env: { GOFER_STAGE_DELEGATE: '1' },
      });
      expect(f.calls[0].options.cwd).not.toBe(process.cwd());
      expect(existsSync(f.calls[0].options.cwd)).toBe(false);
    }
  );

  it('keeps unknown families conservative and takes Copilot families only from native metadata', async () => {
    expect((await fixture('claude').adapter.discover()).models[0].family).toBe(
      'anthropic-unverified-family'
    );
    expect((await fixture('codex').adapter.discover()).models[0].family).toBe(
      'openai-unverified-family'
    );
    expect((await fixture('copilot').adapter.discover()).models[0].family).toBe('native-family');
    const f = fixture('copilot', { entries: [{ id: 'future-a' }, { id: 'future-b' }] });
    const result = await f.adapter.discover();
    expect(result.models[0].family).toBe(result.models[1].family);
  });

  it('retains native Auto as compound while excluding default selectors and unavailable Copilot models', async () => {
    const f = fixture('copilot', {
      entries: [
        { id: 'auto' },
        { id: 'default' },
        { id: 'off', policy: { state: 'disabled' } },
        { id: 'on', policy: { state: 'enabled' } },
      ],
    });
    expect((await f.adapter.discover()).models).toEqual([
      expect.objectContaining({ id: 'auto', nativeCompound: true }),
      expect.objectContaining({ id: 'on', nativeCompound: false }),
    ]);
  });

  it.each(['codex', 'claude', 'copilot'])(
    'preserves native %s compound metadata without treating model names as evidence',
    async (host) => {
      const f = fixture(host, {
        fragment: true,
        entries: [
          { id: 'native-compound', nativeCompound: true },
          { id: 'native-capability', capabilities: { nativeCompound: true } },
          {
            id: 'conflicting-metadata',
            nativeCompound: false,
            capabilities: { nativeCompound: true },
          },
          { id: 'explicit-single', nativeCompound: false },
          { id: 'compound-sounding-name' },
          { id: 'Auto', nativeCompound: false },
        ],
      });
      expect(
        (await f.adapter.discover()).models.map((m: Message) => [m.id, m.nativeCompound])
      ).toEqual([
        ['native-compound', true],
        ['native-capability', true],
        ['conflicting-metadata', true],
        ['explicit-single', false],
        ['compound-sounding-name', false],
        ['Auto', true],
      ]);
    }
  );

  it.each(['codex', 'claude', 'copilot'])(
    'rejects malformed native %s compound metadata',
    async (host) => {
      const f = fixture(host, { entries: [{ id: 'native-model', nativeCompound: 'false' }] });
      await expect(f.adapter.discover()).rejects.toMatchObject({
        code: 'invalid_catalog',
        stageReason: 'adapter_unavailable',
      });
    }
  );

  it('allows native Auto execution without relabeling the actual result model as Auto', async () => {
    const f = fixture('copilot', { entries: [{ id: 'auto' }] });
    await expect(f.adapter.execute({ modelId: 'auto', prompt: 'Review' })).resolves.toMatchObject({
      selectedModelId: 'auto',
      reportedModelId: f.nativeId,
    });
  });

  it.each(['vscode', 'grok-bot', 'gemini', 'codex-desktop', 'agy', 'unknown', 'toString'])(
    'rejects unsupported host %s without spawning',
    (host) => {
      const spawn = vi.fn();
      expect(() => createCliStageAdapter(host, { spawn })).toThrow('unsupported_host');
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it('rejects desktop substitution and arbitrary command/flag overrides', () => {
    expect(() => createCliStageAdapter('codex', { surface: 'desktop' })).toThrow(
      'unsupported_surface'
    );
    expect(() => createCliStageAdapter('codex', { command: 'evil' })).toThrow('invalid_input');
    expect(() => createCliStageAdapter('codex', { args: ['--yolo'] })).toThrow('invalid_input');
  });

  it.each(['codex', 'claude', 'copilot'])('rejects malformed %s catalogs', async (host) => {
    await expect(
      fixture(host, { entries: [{ id: 'bad\n--model other' }] }).adapter.discover()
    ).rejects.toThrow(/invalid_catalog|catalog_unavailable/);
  });

  it('requires authenticated Copilot and the verified protocol', async () => {
    for (const [method, result, reason] of [
      ['auth.getStatus', { isAuthenticated: false }, 'authentication_unavailable'],
      ['ping', { protocolVersion: 99 }, 'unsupported_protocol'],
    ] as const) {
      const f = fixture('copilot', {
        request: (m, c) => {
          if (m.method !== method) return;
          c.send({ jsonrpc: '2.0', id: m.id, result });
          return true;
        },
      });
      await expect(f.adapter.discover()).rejects.toThrow(reason);
    }
  });

  it('accepts Codex intentional signal shutdown after verified discovery', async () => {
    const f = fixture('codex');
    const adapter = createCliStageAdapter('codex', {
      ...fakeOptions,
      spawn: f.spawn,
      terminate: (child: FakeChild) => child.emit('close', null, 'SIGTERM'),
    });
    await expect(adapter.discover()).resolves.toMatchObject({ verified: true });
  });
});

describe('bounded read-only CLI execution', () => {
  it.each(['darwin', 'linux', 'win32'])(
    'blocks unqualified Codex delegates on %s before discovery or inference',
    async (platform) => {
      const spawn = vi.fn();
      const adapter = createCliStageAdapter('codex', { ...fakeOptions, platform, spawn });
      await expect(
        adapter.execute({ modelId: 'gpt-5.4', prompt: 'Review selected context', readOnly: true })
      ).rejects.toMatchObject({
        code: 'codex_read_isolation_unqualified',
        stageReason: 'read_only_unavailable',
        status: 'blocked',
      });
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it('does not accept a Codex qualification override from adapter options', () => {
    for (const key of ['readOnlyIsolation', 'toolLessIsolation', 'qualified', 'allowUnsafe']) {
      expect(() => createCliStageAdapter('codex', { ...fakeOptions, [key]: true })).toThrow(
        'invalid_input'
      );
    }
  });

  it.each(['ordinary', 'disabled'])(
    'preserves the normal Codex stage path for %s requests without native work',
    async (mode) => {
      const f = fixture('codex');
      const result = await executeStage(
        {
          host: 'codex',
          surface: 'cli',
          stage: '6_gofer_validate',
          workType: 'non-app',
          trigger: mode === 'ordinary' ? 'ordinary' : 'delegate',
          task: 'Keep the normal pipeline',
          policy: { enabled: mode !== 'disabled' },
        },
        { adapter: f.adapter, nested: false }
      );
      expect(result).toMatchObject({
        status: 'legacy',
        reason: mode === 'ordinary' ? 'ordinary_request' : 'disabled',
        canClaimDone: false,
      });
      expect(f.spawn).not.toHaveBeenCalled();
    }
  );

  it.each(['codex', 'claude', 'copilot', 'grok'])(
    'executes %s with fresh native selection and native result metadata',
    async (host) => {
      const f = fixture(host);
      if (host === 'codex') {
        await expect(f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).rejects.toThrow(
          'codex_read_isolation_unqualified'
        );
        expect(f.spawn).not.toHaveBeenCalled();
        return;
      }
      const result = await f.adapter.execute({
        modelId: f.nativeId,
        prompt: 'Review this supplied text.',
      });
      expect(result).toMatchObject({
        text: 'A bounded answer',
        selectedModelId: f.nativeId,
        reportedModelId: host === 'codex' ? null : f.nativeId,
        usage: {
          inputTokens: host === 'claude' || host === 'grok' ? 15 : 12,
          cachedInputTokens: 3,
          outputTokens: 4,
        },
      });
      expect(f.calls).toHaveLength(2);
      for (const call of f.calls) {
        expect(call.options.shell).toBe(false);
        expect(call.options.env.GOFER_STAGE_DELEGATE).toBe('1');
        expect(existsSync(call.options.cwd)).toBe(false);
        expect(call.args.join(' ')).not.toMatch(/bypass|dangerously|allow-all|always-approve/);
      }
      const command = f.calls[1];
      if (host === 'codex') {
        expect(command.args).toEqual(
          expect.arrayContaining([
            '--ignore-user-config',
            '--ephemeral',
            '--sandbox',
            'read-only',
            'approval_policy="never"',
            '-',
          ])
        );
        expect(command.args).not.toContain('--ignore-rules');
        expect(command.args).not.toContain('Review this supplied text.');
      } else if (host === 'claude') {
        expect(command.args).toEqual(
          expect.arrayContaining([
            '--tools',
            '',
            '--strict-mcp-config',
            '--setting-sources',
            'project',
            '--no-session-persistence',
            '--disable-slash-commands',
            '{"disableAllHooks":true}',
          ])
        );
        expect(command.messages[0].message.content).toBe('Review this supplied text.');
      } else if (host === 'copilot') {
        expect(command.messages.find((m) => m.method === 'session.create')?.params).toMatchObject({
          availableTools: [],
          tools: [],
          mcpServers: {},
          requestPermission: true,
          enableFileHooks: false,
        });
      } else {
        expect(command.args).toEqual(
          expect.arrayContaining([
            '--sandbox',
            'strict',
            '--tools',
            'read_file',
            '--deny',
            'Edit',
            'Bash',
            'MCPTool',
            '--no-subagents',
            '--disable-web-search',
            '--permission-mode',
            'dontAsk',
          ])
        );
      }
    }
  );

  it('uses private working directories and strips unsafe inherited environment controls', async () => {
    const f = fixture('grok', {
      launch: (c) => {
        if (process.platform !== 'win32') expect(statSync(c.options.cwd).mode & 0o777).toBe(0o700);
        expect(c.options.env).not.toHaveProperty('NODE_OPTIONS');
        expect(c.options.env).not.toHaveProperty('COPILOT_ALLOW_ALL');
      },
    });
    const adapter = createCliStageAdapter('grok', {
      ...fakeOptions,
      spawn: f.spawn,
      env: { NODE_OPTIONS: '--import evil', COPILOT_ALLOW_ALL: '1', AUTH_TOKEN: 'account-secret' },
    });
    await adapter.discover();
    expect(f.calls[0].options.env.AUTH_TOKEN).toBe('account-secret');
  });

  it('retains Codex discovery and the restrictive native qualification arguments', async () => {
    const f = fixture('codex');
    await expect(f.adapter.discover()).resolves.toMatchObject({
      verified: true,
      readOnlyIsolation: false,
      isolationReason: 'codex_read_isolation_unqualified',
    });
    expect(f.calls).toHaveLength(1);
    for (const call of [f.calls[0], { args: codexStageExecutionArgs(f.nativeId) }]) {
      const disabled = call.args.filter((_arg, i) => call.args[i - 1] === '--disable');
      expect(disabled).toEqual(
        expect.arrayContaining([
          'shell_tool',
          'unified_exec',
          'shell_snapshot',
          'code_mode',
          'code_mode_host',
          'code_mode_only',
          'apps',
          'plugins',
          'remote_plugin',
          'hooks',
          'multi_agent',
          'multi_agent_v2',
          'view_image',
          'browser_use',
          'browser_use_external',
          'computer_use',
          'image_generation',
          'memories',
          'skill_search',
          'skill_mcp_dependency_install',
          'workspace_dependencies',
          'goals',
          'in_app_local_automation',
          'request_permissions_tool',
          'tool_suggest',
          'artifact',
          'sleep_tool',
        ])
      );
      const config = call.args.filter((_arg, i) => call.args[i - 1] === '-c');
      expect(config).toEqual(
        expect.arrayContaining([
          'web_search="disabled"',
          'approval_policy="never"',
          'shell_environment_policy.inherit="none"',
          'project_doc_max_bytes=0',
          'skills.include_instructions=false',
          'skills.bundled.enabled=false',
          'suppress_unstable_features_warning=true',
        ])
      );
      expect(call.args.filter((_arg, i) => call.args[i - 1] === '--enable')).toEqual([
        'skip_host_skill_discovery',
      ]);
    }
    expect(codexStageExecutionArgs(f.nativeId)).toEqual(
      expect.arrayContaining(['--strict-config', '--ignore-user-config'])
    );
  });

  it('preserves Codex account/auth and transport while excluding unrelated credentials and overrides', async () => {
    const f = fixture('codex');
    const retained = {
      PATH: '/native/bin',
      HOME: '/native/home',
      CODEX_HOME: '/native/isolated-account',
      OPENAI_API_KEY: 'synthetic-openai-key',
      CODEX_API_KEY: 'synthetic-codex-key',
      HTTPS_PROXY: 'https://synthetic-proxy',
      no_proxy: 'localhost',
      SSL_CERT_FILE: '/native/ca.pem',
    };
    const excluded = {
      AWS_SECRET_ACCESS_KEY: 'synthetic-aws-key',
      GH_TOKEN: 'synthetic-github-key',
      ANTHROPIC_API_KEY: 'synthetic-anthropic-key',
      DATABASE_URL: 'synthetic-db',
      NODE_OPTIONS: '--import injected',
      BASH_ENV: '/injected',
      ENV: '/injected',
      LD_PRELOAD: '/injected',
      DYLD_INSERT_LIBRARIES: '/injected',
      OPENAI_BASE_URL: 'https://wrong-account.invalid',
      CODEX_CONFIG: 'untrusted',
      CODEX_UNSAFE_ALLOW_NO_SANDBOX: '1',
      CODEX_SANDBOX_NETWORK_DISABLED: '0',
    };
    const adapter = createCliStageAdapter('codex', {
      ...fakeOptions,
      spawn: f.spawn,
      env: { ...retained, ...excluded },
    });
    await expect(adapter.discover()).resolves.toHaveProperty('verified', true);
    for (const call of f.calls) {
      expect(call.options.env).toEqual({
        ...retained,
        GOFER_STAGE_DELEGATE: '1',
        CI: '1',
        NO_COLOR: '1',
        AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
        DISABLE_AUTOUPDATER: '1',
      });
      expect(call.args.join(' ')).not.toContain('synthetic-openai-key');
    }
  });

  it.each(['item.started', 'item.updated', 'item.completed'])(
    'rejects Codex tool activity at %s even before a valid answer',
    async (type) => {
      for (const itemType of [
        'command_execution',
        'mcp_tool_call',
        'web_search',
        'file_change',
        'collab_tool_call',
        'view_image',
        'future_tool',
      ]) {
        const f = fixture('codex', {
          events: [
            { type, item: { type: itemType, command: 'UNTRUSTED_SECRET' } },
            { type: 'item.completed', item: { type: 'agent_message', text: 'Do not accept this' } },
            { type: 'turn.completed' },
          ],
        });
        expect(f.decode).toThrow(
          expect.objectContaining({
            message: 'readonly_violation',
            stageReason: 'read_only_unavailable',
          })
        );
        expect(f.spawn).not.toHaveBeenCalled();
      }
    }
  );

  it('rejects unknown Codex events instead of silently accepting new permission/tool protocols', async () => {
    const f = fixture('codex', {
      events: [{ type: 'permission.requested', secret: 'DO_NOT_EXPOSE' }],
    });
    expect(f.decode).toThrow(/^readonly_violation$/);
  });

  it('accepts Codex lifecycle and reasoning events without exposing reasoning', async () => {
    const f = fixture('codex', {
      events: [
        { type: 'thread.started', thread_id: 'synthetic-thread' },
        { type: 'turn.started' },
        { type: 'item.started', item: { type: 'reasoning', text: 'PRIVATE_REASONING' } },
        { type: 'item.completed', item: { type: 'reasoning', text: 'PRIVATE_REASONING' } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'Public answer' } },
        { type: 'turn.completed' },
      ],
    });
    const result = f.decode();
    expect(result.text).toBe('Public answer');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
  });

  it.each(['darwin', 'linux', 'win32'])(
    'blocks unqualified Antigravity review on %s before any process starts',
    async (platform) => {
      const f = fixture('antigravity');
      const adapter = createCliStageAdapter('antigravity', {
        spawn: f.spawn,
        platform,
        env: {
          HOME: '/synthetic-home',
          ANTIGRAVITY_AGENT: 'read-only',
          ANTIGRAVITY_SANDBOX: 'true',
        },
      });
      await expect(
        adapter.execute({ modelId: f.nativeId, prompt: 'Plan only; do not edit', readOnly: true })
      ).rejects.toMatchObject({ code: 'readonly_isolation_unavailable', status: 'blocked' });
      expect(f.spawn).not.toHaveBeenCalled();
    }
  );

  it('does not permit unverified Antigravity agent or permission overrides', () => {
    for (const option of ['agent', 'mode', 'sandbox', 'permissions', 'readOnlyIsolation']) {
      expect(() => createCliStageAdapter('antigravity', { [option]: true })).toThrow();
    }
  });

  it.each(['codex', 'claude', 'copilot', 'grok'])(
    'rejects unadvertised %s model before inference',
    async (host) => {
      const f = fixture(host);
      await expect(
        f.adapter.execute({ modelId: 'not-in-account', prompt: 'Review' })
      ).rejects.toThrow(
        host === 'codex' ? 'codex_read_isolation_unqualified' : 'model_not_advertised'
      );
      expect(f.calls).toHaveLength(host === 'codex' ? 0 : 1);
    }
  );

  it.each(['--model=evil', 'bad\nmodel', 'bad;touch-file', 'a b'])(
    'rejects unsafe model %s before spawning',
    async (modelId) => {
      const f = fixture('claude');
      await expect(f.adapter.execute({ modelId, prompt: 'Review' })).rejects.toThrow(
        'invalid_model'
      );
      expect(f.spawn).not.toHaveBeenCalled();
    }
  );

  it('bounds prompt bytes and does not infer model identity from response text', async () => {
    const f = fixture('codex', {
      events: [
        { type: 'item.completed', item: { type: 'agent_message', text: 'I am another-model.' } },
        { type: 'turn.completed', usage: {} },
      ],
    });
    const active = fixture('claude');
    await expect(
      active.adapter.execute({ modelId: active.nativeId, prompt: 'x'.repeat(262_145) })
    ).rejects.toThrow('input_limit');
    await expect(
      active.adapter.execute({ modelId: active.nativeId, prompt: '\u00e9'.repeat(131_073) })
    ).rejects.toThrow('input_limit');
    expect(active.spawn).not.toHaveBeenCalled();
    expect(f.decode().reportedModelId).toBeNull();
  });

  it('rejects multiple native identities and error results without leaking contents', async () => {
    const f = fixture('claude', {
      events: [
        { type: 'assistant', message: { model: 'model-a' } },
        { type: 'assistant', message: { model: 'model-b' } },
        { type: 'result', subtype: 'success', result: 'text' },
      ],
    });
    await expect(f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).rejects.toThrow(
      'model_identity_changed'
    );
    const failed = fixture('grok', {
      events: [{ type: 'result', is_error: true, result: 'SECRET_NATIVE_ERROR' }],
    });
    await expect(
      failed.adapter.execute({ modelId: failed.nativeId, prompt: 'Review' })
    ).rejects.toThrow(/^native_inference_failed$/);
  });

  it('rejects success exits without a complete native result', async () => {
    const f = fixture('codex', {
      events: [{ type: 'item.completed', item: { type: 'agent_message', text: 'partial' } }],
    });
    expect(f.decode).toThrow('incomplete_result');
  });

  it('preserves trailing newlines in native answer text', async () => {
    const f = fixture('grok', {
      events: [{ type: 'result', subtype: 'success', result: 'Review complete.\n' }],
    });
    expect((await f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).text).toBe(
      'Review complete.\n'
    );
  });

  it.each(['codex', 'claude', 'copilot', 'grok'])(
    'supports the combined evidence prompt without putting it on %s argv',
    async (host) => {
      const prompt = 'a'.repeat(65_536) + '\nPrevious output:\n' + 'b'.repeat(65_536);
      const f = fixture(host, {
        launch: (c) => {
          expect(c.args.join(' ').length).toBeLessThan(4_000);
          if (c.args.includes('--prompt-file')) {
            const file = c.args[c.args.indexOf('--prompt-file') + 1];
            expect(readFileSync(file, 'utf8')).toBe(prompt);
            if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
            expect(path.dirname(file)).toBe(c.options.cwd);
          }
        },
      });
      if (host === 'codex') {
        await expect(f.adapter.execute({ modelId: f.nativeId, prompt })).rejects.toThrow(
          'codex_read_isolation_unqualified'
        );
        expect(f.spawn).not.toHaveBeenCalled();
        expect(codexStageExecutionArgs(f.nativeId).join(' ')).not.toContain(prompt);
        return;
      }
      await expect(
        f.adapter.execute({ modelId: f.nativeId, prompt, readOnly: true, maxCostUsd: null })
      ).resolves.toHaveProperty('text');
    }
  );

  it('does not claim or silently ignore hard cost enforcement', async () => {
    const f = fixture('claude');
    expect(f.adapter.enforcesCostLimit).toBe(false);
    for (const maxCostUsd of [0, 1, NaN, -1])
      await expect(
        f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxCostUsd })
      ).rejects.toThrow('hard_cost_limit_unavailable');
    await expect(
      f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', readOnly: false })
    ).rejects.toThrow('readonly_required');
    expect(f.spawn).not.toHaveBeenCalled();
  });

  it('refuses unexpected Copilot server requests rather than approving permissions', async () => {
    const f = fixture('copilot', {
      request: (m, c) => {
        if (m.method !== 'session.create') return;
        c.send({
          jsonrpc: '2.0',
          id: 'permission',
          method: 'permission.request',
          params: { secret: 'DO_NOT_EXPOSE' },
        });
        return true;
      },
    });
    await expect(f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).rejects.toThrow(
      /^unexpected_server_request$/
    );
    expect(f.calls[1].messages.some((m) => m.method === 'session.send')).toBe(false);
  });
});

describe('native usage normalization', () => {
  const messagesUsage = async (host: string, usage: Message, extra: Message = {}) => {
    const f = fixture(host, {
      events: [{ type: 'result', subtype: 'success', result: 'Answer', usage, ...extra }],
    });
    return (await f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).usage;
  };

  it.each(['claude', 'grok'])(
    'includes uncached, cache-write and cache-read input exactly once for %s',
    async (host) => {
      const raw = {
        input_tokens: 2,
        cache_creation_input_tokens: 6045,
        cache_read_input_tokens: 3289,
        output_tokens: 212,
      };
      const usage = await messagesUsage(
        host,
        {
          ...raw,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 6045 },
          iterations: [raw],
        },
        {
          modelUsage: {
            'future-model-a': {
              inputTokens: 2,
              cacheCreationInputTokens: 6045,
              cacheReadInputTokens: 3289,
              outputTokens: 212,
            },
          },
          total_cost_usd: 0.02,
        }
      );
      expect(usage).toEqual({
        inputTokens: 9336,
        cachedInputTokens: 3289,
        outputTokens: 212,
        costUsd: 0.02,
      });
      expect(
        aggregateUsage([
          { phase: 'worker', usage },
          { phase: 'critic', usage },
        ]).total
      ).toEqual({ inputTokens: 18672, cachedInputTokens: 6578, outputTokens: 424, costUsd: 0.04 });
    }
  );

  it.each(['claude', 'grok'])('retains explicit zero cache buckets for %s', async (host) => {
    expect(
      await messagesUsage(host, {
        input_tokens: 2,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      })
    ).toEqual({ inputTokens: 2, cachedInputTokens: 0, outputTokens: 0 });
  });

  it.each(['claude', 'grok'])(
    'does not present partial input reporting as a full total for %s',
    async (host) => {
      for (const missing of [
        'input_tokens',
        'cache_creation_input_tokens',
        'cache_read_input_tokens',
      ]) {
        const raw: Message = {
          input_tokens: 2,
          cache_creation_input_tokens: 6045,
          cache_read_input_tokens: 3289,
          output_tokens: 212,
        };
        delete raw[missing];
        const usage = await messagesUsage(host, raw);
        expect(usage).not.toHaveProperty('inputTokens');
        expect(aggregateUsage([{ phase: 'worker', usage }]).total.inputTokens).toBeNull();
        expect(usage.outputTokens).toBe(212);
        if (missing !== 'cache_read_input_tokens') expect(usage.cachedInputTokens).toBe(3289);
      }
      expect(
        await messagesUsage(host, {
          input_tokens: 2,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: 0,
        })
      ).toEqual({ cachedInputTokens: 0 });
    }
  );

  it('does not add cache subsets to inclusive Codex input', async () => {
    const f = fixture('codex', {
      events: [
        { type: 'item.completed', item: { type: 'agent_message', text: 'Answer' } },
        {
          type: 'turn.completed',
          usage: {
            input_tokens: 12,
            cached_input_tokens: 3,
            cache_creation_input_tokens: 5,
            cache_read_input_tokens: 3,
            output_tokens: 4,
          },
        },
      ],
    });
    expect(f.decode().usage).toEqual({
      inputTokens: 12,
      cachedInputTokens: 3,
      outputTokens: 4,
    });
  });

  it('sums inclusive Copilot event totals without adding cache-write or cache-read subsets', async () => {
    const f = fixture('copilot', {
      events: [
        { type: 'assistant.message', data: { content: 'Answer', model: 'future-model-a' } },
        {
          type: 'assistant.usage',
          data: { inputTokens: 12, cacheReadTokens: 3, cacheWriteTokens: 5, outputTokens: 4 },
        },
        {
          type: 'assistant.usage',
          data: { inputTokens: 20, cacheReadTokens: 4, cacheWriteTokens: 6, outputTokens: 5 },
        },
        { type: 'session.idle', data: {} },
      ],
    });
    expect((await f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).usage).toEqual({
      inputTokens: 32,
      cachedInputTokens: 7,
      outputTokens: 9,
    });
  });

  it('keeps incomplete Copilot multi-event totals unknown instead of silently dropping missing usage', async () => {
    const f = fixture('copilot', {
      events: [
        { type: 'assistant.message', data: { content: 'Answer', model: 'future-model-a' } },
        {
          type: 'assistant.usage',
          data: { inputTokens: 12, cacheReadTokens: 3, outputTokens: 4, costUsd: 0.01 },
        },
        { type: 'assistant.usage', data: { cacheReadTokens: 0, outputTokens: 2 } },
        {
          type: 'assistant.usage',
          data: { inputTokens: 20, cacheReadTokens: 4, outputTokens: 5, costUsd: 0.02 },
        },
        { type: 'session.idle', data: {} },
      ],
    });
    const usage = (await f.adapter.execute({ modelId: f.nativeId, prompt: 'Review' })).usage;
    expect(usage).toEqual({ cachedInputTokens: 7, outputTokens: 11 });
    expect(aggregateUsage([{ phase: 'worker', usage }]).total).toEqual({
      inputTokens: null,
      cachedInputTokens: 7,
      outputTokens: 11,
      costUsd: null,
    });
  });

  it('leaves explicitly incomplete Grok usage and partial prices unknown', async () => {
    const raw = {
      input_tokens: 2,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
      output_tokens: 5,
    };
    expect(
      await messagesUsage('grok', raw, { usage_is_incomplete: true, total_cost_usd: 0.01 })
    ).toEqual({});
    expect(
      await messagesUsage('grok', raw, { cost_is_partial: true, total_cost_usd: 0.01 })
    ).toEqual({ inputTokens: 9, cachedInputTokens: 4, outputTokens: 5 });
  });

  it.each(['claude', 'grok'])(
    'rejects invalid or overflowing disjoint token buckets for %s',
    async (host) => {
      for (const cache_creation_input_tokens of [-1, 1.5, '3', Number.MAX_SAFE_INTEGER]) {
        await expect(
          messagesUsage(host, {
            input_tokens: 2,
            cache_creation_input_tokens,
            cache_read_input_tokens: 3,
            output_tokens: 4,
          })
        ).rejects.toMatchObject({ code: 'invalid_usage' });
      }
    }
  );
});

describe('process bounds, cancellation and portability', () => {
  it('exposes only safe stage reasons for blocked adapters, models and read-only controls', async () => {
    expect(() => createCliStageAdapter('desktop')).toThrow(
      expect.objectContaining({ stageReason: 'adapter_unavailable' })
    );
    const unsafe = fixture('antigravity');
    await expect(
      unsafe.adapter.execute({ modelId: unsafe.nativeId, prompt: 'Review' })
    ).rejects.toMatchObject({ stageReason: 'read_only_unavailable' });
    const f = fixture('grok');
    await expect(
      f.adapter.execute({ modelId: 'missing-model', prompt: 'Review' })
    ).rejects.toMatchObject({ stageReason: 'model_unavailable' });
    await expect(
      f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxCostUsd: 1 })
    ).rejects.toMatchObject({ stageReason: 'hard_cost_limit_unavailable' });
  });

  it('maps aborts and timeouts to the core lifecycle reasons', async () => {
    const f = fixture('grok', { launch: () => true });
    await expect(f.adapter.discover({ signal: AbortSignal.abort() })).rejects.toMatchObject({
      stageReason: 'cancelled',
    });
    await expect(f.adapter.discover({ timeoutMs: 20 })).rejects.toMatchObject({
      stageReason: 'time_limit',
    });
  });

  it('does not trust provider-supplied stage reasons or credentials in errors', async () => {
    const adapter = createCliStageAdapter('copilot', {
      ...fakeOptions,
      spawn: () => {
        throw Object.assign(new Error('PRIVATE_TOKEN'), {
          stageReason: 'PRIVATE_PROVIDER_REASON',
          code: 'PRIVATE_CODE',
        });
      },
    });
    await expect(adapter.discover()).rejects.toMatchObject({
      message: 'native_executable_unavailable',
      stageReason: 'adapter_unavailable',
    });
    const f = fixture('copilot', {
      request: (m, c) => {
        c.send({
          jsonrpc: '2.0',
          id: m.id,
          error: { message: 'PRIVATE_TOKEN', stageReason: 'PRIVATE_PROVIDER_REASON' },
        });
        return true;
      },
    });
    await expect(f.adapter.discover()).rejects.toMatchObject({
      message: 'native_rpc_failed',
      stageReason: 'adapter_unavailable',
    });
  });

  it.each(['codex', 'claude', 'copilot', 'grok'])(
    'cancels %s inference and cleans both isolated directories',
    async (host) => {
      const controller = new AbortController();
      const f = fixture(host, {
        launch: (c) => {
          if (!c.args.includes('--model')) return;
          controller.abort();
          return true;
        },
        request: (m) => {
          if (m.method !== 'session.send') return;
          controller.abort();
          return true;
        },
      });
      await expect(
        f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', signal: controller.signal })
      ).rejects.toThrow(host === 'codex' ? 'codex_read_isolation_unqualified' : 'aborted');
      expect(f.calls).toHaveLength(host === 'codex' ? 0 : 2);
      for (const call of f.calls) {
        expect(call.child.kill).toHaveBeenCalled();
        expect(existsSync(call.options.cwd)).toBe(false);
      }
    }
  );

  it('escalates tree termination even when the leader closes on TERM', async () => {
    const f = fixture('grok', { launch: () => true });
    const terminate = vi.fn((child: FakeChild, signal: string) => child.kill(signal));
    const adapter = createCliStageAdapter('grok', { ...fakeOptions, spawn: f.spawn, terminate });
    await expect(adapter.discover({ timeoutMs: 20 })).rejects.toThrow('timeout');
    expect(terminate.mock.calls.map((call) => call[1])).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('fails closed if the child does not close after hard termination', async () => {
    const f = fixture('grok', { launch: () => true });
    const adapter = createCliStageAdapter('grok', {
      ...fakeOptions,
      spawn: f.spawn,
      terminate: () => {},
    });
    await expect(adapter.discover({ timeoutMs: 20 })).rejects.toThrow('cleanup_failed');
  });

  it.each(['codex', 'claude', 'copilot', 'grok', 'antigravity'])(
    'cancels %s discovery and cleans up the process',
    async (host) => {
      const controller = new AbortController();
      const f = fixture(host, {
        launch: () => {
          controller.abort();
          return true;
        },
        request: () => true,
      });
      await expect(f.adapter.discover({ signal: controller.signal })).rejects.toThrow('aborted');
      expect(f.calls[0].child.kill).toHaveBeenCalled();
      expect(existsSync(f.calls[0].options.cwd)).toBe(false);
    }
  );

  it('does not spawn for an already-cancelled signal or invalid bounds', async () => {
    const f = fixture('grok');
    await expect(f.adapter.discover({ signal: AbortSignal.abort() })).rejects.toThrow('aborted');
    for (const input of [
      { timeoutMs: Infinity },
      { timeoutMs: 0 },
      { maxOutputBytes: 0 },
      { maxOutputBytes: 4_194_305 },
    ])
      await expect(f.adapter.discover(input)).rejects.toThrow('invalid_input');
    expect(f.spawn).not.toHaveBeenCalled();
  });

  it('times out a silent native process', async () => {
    const f = fixture('claude', { launch: () => true, request: () => true });
    await expect(f.adapter.discover({ timeoutMs: 30 })).rejects.toThrow('timeout');
    expect(f.calls[0].child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it.each(['stdout', 'stderr'] as const)('bounds combined native %s bytes', async (stream) => {
    const f = fixture('grok', {
      launch: (c) => {
        c.child[stream].write('x'.repeat(1_048_577));
        return true;
      },
    });
    await expect(f.adapter.discover({ maxOutputBytes: 1_024 })).rejects.toThrow(
      /^protocol_output_limit$/
    );
    expect(f.calls[0].child.kill).toHaveBeenCalled();
  });

  it.each([1_024, 65_536])(
    'allows large native catalog/session metadata with an answer below %i bytes',
    async (maxOutputBytes) => {
      const f = fixture('copilot', {
        entries: [{ id: 'future-model-a', billing: { metadata: 'x'.repeat(96 * 1_024) } }],
        events: [
          { type: 'session.info', data: { metadata: 'x'.repeat(128 * 1_024) } },
          {
            type: 'assistant.message',
            data: { content: '{"totalCents":2416}', model: 'future-model-a' },
          },
          { type: 'session.idle', data: {} },
        ],
      });
      await expect(f.adapter.discover({ maxOutputBytes })).resolves.toMatchObject({
        verified: true,
      });
      await expect(
        f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxOutputBytes })
      ).resolves.toMatchObject({ text: '{"totalCents":2416}', selectedModelId: f.nativeId });
      expect(f.calls).toHaveLength(3);
    }
  );

  it.each([1_024, 65_536])(
    'rejects actual answer text above %i bytes even with a larger protocol allowance',
    async (maxOutputBytes) => {
      const f = fixture('copilot', {
        entries: [{ id: 'future-model-a', billing: { metadata: 'x'.repeat(96 * 1_024) } }],
        events: [
          {
            type: 'assistant.message',
            data: { content: 'x'.repeat(maxOutputBytes + 1), model: 'future-model-a' },
          },
        ],
      });
      // No idle event: oversized answers must stop immediately, not wait for timeout.
      await expect(
        f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxOutputBytes })
      ).rejects.toMatchObject({ code: 'output_limit', stageReason: 'output_limit' });
      expect(f.calls[1].child.kill).toHaveBeenCalled();
    }
  );

  it('does not allow a later small answer to hide an earlier oversized answer', async () => {
    const f = fixture('copilot', {
      events: [
        {
          type: 'assistant.message',
          data: { content: 'x'.repeat(1_025), model: 'future-model-a' },
        },
        { type: 'assistant.message', data: { content: 'Small answer', model: 'future-model-a' } },
        { type: 'session.idle', data: {} },
      ],
    });
    await expect(
      f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxOutputBytes: 1_024 })
    ).rejects.toMatchObject({ code: 'output_limit' });
  });

  it('shares a finite protocol ceiling across catalogue refreshes and session events', async () => {
    const f = fixture('copilot', {
      entries: [{ id: 'future-model-a', billing: { metadata: 'x'.repeat(400 * 1_024) } }],
      events: [
        { type: 'session.info', data: { metadata: 'x'.repeat(300 * 1_024) } },
        { type: 'assistant.message', data: { content: 'Small answer', model: 'future-model-a' } },
        { type: 'session.idle', data: {} },
      ],
    });
    await expect(
      f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxOutputBytes: 65_536 })
    ).rejects.toMatchObject({
      code: 'protocol_output_limit',
      stageReason: 'protocol_output_limit',
    });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].child.kill).toHaveBeenCalled();
  });

  it('counts stderr and stdout together against the protocol ceiling', async () => {
    const f = fixture('grok', {
      launch: (c) => {
        c.child.stderr.write('x'.repeat(600 * 1_024));
        c.child.stdout.write('x'.repeat(600 * 1_024));
        return true;
      },
    });
    await expect(f.adapter.discover({ maxOutputBytes: 1_024 })).rejects.toMatchObject({
      code: 'protocol_output_limit',
    });
  });

  it('still bounds the public normalized discovery result', async () => {
    const f = fixture('copilot', {
      entries: Array.from({ length: 20 }, (_, i) => ({ id: `model-${i}` })),
    });
    await expect(f.adapter.discover({ maxOutputBytes: 1_024 })).rejects.toMatchObject({
      code: 'output_limit',
    });
  });

  it('bounds inference output, not just catalog output', async () => {
    const f = fixture('grok', {
      events: [{ type: 'result', subtype: 'success', result: 'x'.repeat(5_000) }],
    });
    await expect(
      f.adapter.execute({ modelId: f.nativeId, prompt: 'Review', maxOutputBytes: 2_048 })
    ).rejects.toThrow('output_limit');
  });

  it('sanitizes spawn failures, process failures and native RPC errors', async () => {
    const adapter = createCliStageAdapter('grok', {
      ...fakeOptions,
      spawn: () => {
        throw new Error('SECRET');
      },
    });
    await expect(adapter.discover()).rejects.toThrow(/^native_executable_unavailable$/);
    const f = fixture('grok', {
      launch: (c) => {
        c.child.stderr.write('SECRET');
        c.close(1);
        return true;
      },
    });
    await expect(f.adapter.discover()).rejects.toThrow(/^native_process_failed$/);
    const rpc = fixture('copilot', {
      request: (m, c) => {
        c.send({ jsonrpc: '2.0', id: m.id, error: { message: 'SECRET' } });
        return true;
      },
    });
    await expect(rpc.adapter.discover()).rejects.toThrow(/^native_rpc_failed$/);
  });

  it('rejects oversized Content-Length headers before accepting a payload', async () => {
    const f = fixture('copilot', {
      request: (_m, c) => {
        c.child.stdout.write('Content-Length: 999999999\r\n\r\n');
        return true;
      },
    });
    await expect(f.adapter.discover()).rejects.toThrow('output_limit');
  });

  it('uses Windows native executables and taskkill tree cleanup without cmd.exe', async () => {
    const controller = new AbortController();
    const f = fixture('grok', {
      launch: (c) => {
        c.child.pid = 4242;
        controller.abort();
        return true;
      },
    });
    const execFileSync = vi.fn(() => f.calls[0].close());
    const adapter = createCliStageAdapter('grok', {
      spawn: f.spawn,
      platform: 'win32',
      env: { Path: 'C:\\Native Tools', SystemRoot: 'C:\\Windows' },
      exists: (file: string) => file === 'C:\\Native Tools\\grok.exe',
      execFileSync,
    });
    await expect(adapter.discover({ signal: controller.signal })).rejects.toThrow('aborted');
    expect(f.calls[0].command).toBe('C:\\Native Tools\\grok.exe');
    expect(f.calls[0].options).toMatchObject({ shell: false, detached: false });
    expect(execFileSync).toHaveBeenCalledWith(
      path.win32.join('C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', '4242', '/T', '/F'],
      expect.objectContaining({ shell: false, timeout: 1_000 })
    );
  });

  it.each(['codex', 'claude', 'copilot', 'grok', 'antigravity'])(
    'resolves %s on simulated Windows without installed executables',
    async (host) => {
      const f = fixture(host);
      const executable = `C:\\Native Tools\\${host === 'antigravity' ? 'agy' : host}.exe`;
      const exists = vi.fn(async (file: string) => file === executable);
      const adapter = createCliStageAdapter(host, {
        spawn: f.spawn,
        platform: 'win32',
        env: { Path: 'C:\\Native Tools', SystemRoot: 'C:\\Windows' },
        exists,
      });
      await expect(adapter.discover()).resolves.toHaveProperty('verified', true);
      expect(f.calls[0].command).toBe(executable);
      expect(f.calls[0].options).toMatchObject({ shell: false, detached: false });
      expect(exists).toHaveBeenCalledWith(executable);
    }
  );

  it('keeps the fixed Windows Codex npm entrypoint fallback without executing a cmd wrapper', async () => {
    const f = fixture('codex');
    const entry = 'C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
    const adapter = createCliStageAdapter('codex', {
      spawn: f.spawn,
      platform: 'win32',
      env: { PATH: 'C:\\npm' },
      exists: async (file: string) => file === 'C:\\npm\\codex.cmd' || file === entry,
    });
    await adapter.discover();
    for (const call of f.calls) {
      expect(call.command).toBe(process.execPath);
      expect(call.args[0]).toBe(entry);
      expect(call.options.shell).toBe(false);
    }
  });

  it('ignores relative Windows PATH entries rather than using the working directory', async () => {
    const spawn = vi.fn();
    const exists = vi.fn(() => true);
    const adapter = createCliStageAdapter('grok', {
      spawn,
      platform: 'win32',
      env: { PATH: '.;tools;C:relative' },
      exists,
    });
    await expect(adapter.discover()).rejects.toThrow('native_executable_unavailable');
    expect(exists).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['codex', 'grok'])(
    'bounds a stalled Windows %s executable lookup without spawning late',
    async (host) => {
      const spawn = vi.fn();
      let resolve!: (value: boolean) => void;
      const exists = vi.fn(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          })
      );
      const adapter = createCliStageAdapter(host, {
        spawn,
        platform: 'win32',
        env: { PATH: '\\\\offline\\tools' },
        exists,
      });
      await expect(adapter.discover({ timeoutMs: 100 })).rejects.toMatchObject({
        stageReason: 'time_limit',
      });
      expect(exists).toHaveBeenCalledTimes(1);
      resolve(true);
      await new Promise((done) => setTimeout(done, 0));
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it('cancels a pending Windows executable lookup without starting the native CLI', async () => {
    const controller = new AbortController();
    const spawn = vi.fn();
    let resolve!: (value: boolean) => void;
    const adapter = createCliStageAdapter('codex', {
      spawn,
      platform: 'win32',
      env: { PATH: 'C:\\Native Tools' },
      exists: () =>
        new Promise<boolean>((done) => {
          resolve = done;
          queueMicrotask(() => controller.abort());
        }),
    });
    await expect(adapter.discover({ signal: controller.signal })).rejects.toMatchObject({
      stageReason: 'cancelled',
    });
    resolve(true);
    await new Promise((done) => setTimeout(done, 0));
    expect(spawn).not.toHaveBeenCalled();
  });

  it('blocks Windows shell wrappers rather than substituting desktop clients', async () => {
    const spawn = vi.fn();
    const adapter = createCliStageAdapter('copilot', {
      spawn,
      platform: 'win32',
      env: { PATH: 'C:\\npm' },
      exists: (file: string) => file.endsWith('.cmd'),
    });
    await expect(adapter.discover()).rejects.toThrow('native_executable_unavailable');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects oversized Windows command lines explicitly before spawning', async () => {
    const spawn = vi.fn();
    const adapter = createCliStageAdapter('grok', {
      spawn,
      platform: 'win32',
      env: { PATH: `C:\\${'x'.repeat(16_000)}` },
      exists: () => true,
    });
    await expect(adapter.discover()).rejects.toThrow('command_line_limit');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('cleans up when cancellation happens synchronously inside spawn', async () => {
    const controller = new AbortController();
    const f = fixture('grok', { launch: () => true });
    const adapter = createCliStageAdapter('grok', {
      ...fakeOptions,
      spawn: (...args: Parameters<typeof f.spawn>) => {
        const child = f.spawn(...args);
        controller.abort();
        return child;
      },
    });
    await expect(adapter.discover({ signal: controller.signal })).rejects.toThrow('aborted');
    expect(f.calls[0].child.kill).toHaveBeenCalled();
  });
});
