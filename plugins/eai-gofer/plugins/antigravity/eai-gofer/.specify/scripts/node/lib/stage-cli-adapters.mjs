import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, chmod, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { discoverModels } from './model-discovery.mjs';

const COMMANDS = Object.freeze({ codex: 'codex', claude: 'claude', copilot: 'copilot', grok: 'grok', antigravity: 'agy' });
const RPC_METHODS = new Set(['ping', 'auth.getStatus', 'models.list', 'session.create', 'session.send']);
// Two bounded 64 KiB evidence blocks plus executor instructions/JSON escaping.
const MAX_PROMPT = 262_144;
const MAX_OUTPUT = 4_194_304;
const PROTOCOL_ALLOWANCE = 1_048_576;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]{0,255}$/.test(v);
const check = (ok, code = 'invalid_input') => { if (!ok) throw new StageCliError(code); };
const STAGE_REASONS = Object.freeze({
  aborted: 'cancelled', timeout: 'time_limit',
  readonly_isolation_unavailable: 'read_only_unavailable', readonly_required: 'read_only_unavailable',
  readonly_violation: 'read_only_unavailable', unexpected_server_request: 'read_only_unavailable',
  codex_read_isolation_unqualified: 'read_only_unavailable',
  model_not_advertised: 'model_unavailable', invalid_model: 'model_unavailable',
  catalog_unavailable: 'model_unavailable', invalid_model_identity: 'model_unavailable', model_identity_changed: 'model_unavailable',
  hard_cost_limit_unavailable: 'hard_cost_limit_unavailable',
  input_limit: 'input_limit', command_line_limit: 'input_limit', output_limit: 'output_limit',
  protocol_output_limit: 'protocol_output_limit',
});

// Only fixed codes cross the boundary. Never attach native stderr, RPC errors or causes.
class StageCliError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StageCliError'; this.code = code; this.reason = code; this.status = 'blocked';
    this.stageReason = Object.hasOwn(STAGE_REASONS, code) ? STAGE_REASONS[code] : 'adapter_unavailable';
  }
}

function limitsFor(input = {}, discovery = false) {
  check(object(input));
  const timeoutMs = input.timeoutMs ?? (discovery ? 10_000 : 120_000);
  const maxOutputBytes = input.maxOutputBytes ?? 1_048_576;
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000);
  check(Number.isSafeInteger(maxOutputBytes) && maxOutputBytes >= 1_024 && maxOutputBytes <= MAX_OUTPUT);
  const signal = input.signal;
  check(signal === undefined || (typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function' && typeof signal.aborted === 'boolean'));
  check(!signal?.aborted, 'aborted');
  // Catalogues, echoed prompts and session metadata are not answer text. The wire
  // allowance stays bounded and is shared across every subprocess in this call.
  return { signal, timeoutMs, maxOutputBytes, maxProtocolBytes: Math.max(PROTOCOL_ALLOWANCE, maxOutputBytes), deadline: Date.now() + timeoutMs, bytes: 0 };
}

function remaining(limits) {
  check(!limits.signal?.aborted, 'aborted');
  const value = limits.deadline - Date.now();
  check(value > 0, 'timeout');
  return value;
}

// Preserve native auth location and transport, not unrelated service credentials,
// endpoint overrides, injected runtimes or the parent agent's execution controls.
const CODEX_ENV = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME',
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR',
]);

function delegateEnv(source, host) {
  const env = host === 'codex'
    ? Object.fromEntries(Object.entries(source).filter(([key]) => CODEX_ENV.has(key.toUpperCase())))
    : { ...source };
  // Keep current-account authentication, but not inherited execution/permission overrides.
  for (const key of Object.keys(env)) {
    if (/^(NODE_OPTIONS|BASH_ENV|ENV|CLAUDECODE|COPILOT_ALLOW_ALL|COPILOT_ASSISTED_APPROVAL|GROK_SANDBOX)$/i.test(key)) delete env[key];
  }
  return { ...env, GOFER_STAGE_DELEGATE: '1', CI: '1', NO_COLOR: '1', AGY_CLI_DISABLE_AUTO_UPDATE: 'true', DISABLE_AUTOUPDATER: '1' };
}

async function executableExists(file, options, limits) {
  const timeoutMs = remaining(limits);
  let timer;
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(new StageCliError('aborted'));
    limits.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => reject(new StageCliError('timeout')), timeoutMs);
  });
  try {
    remaining(limits);
    // Native stat is asynchronous: a disconnected Windows/UNC PATH entry must
    // not block the event loop. Its underlying OS I/O cannot itself be cancelled.
    const exists = await Promise.race([
      Promise.resolve().then(() => options.exists ? options.exists(file) : stat(file).then(value => value.isFile())).catch(() => false),
      stopped,
    ]);
    remaining(limits);
    return exists === true;
  } finally {
    clearTimeout(timer);
    limits.signal?.removeEventListener('abort', onAbort);
  }
}

async function invocation(host, args, options, env, limits) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return { command: COMMANDS[host], args };
  const search = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of search.split(';').filter(Boolean)) {
    const dir = directory.replace(/^"|"$/g, '');
    // Never resolve an executable relative to the untrusted working directory.
    if (!path.win32.isAbsolute(dir)) continue;
    const executable = path.win32.join(dir, `${COMMANDS[host]}.exe`);
    if (await executableExists(executable, options, limits)) return { command: executable, args };
    if (host === 'codex') {
      const entry = path.win32.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (await executableExists(path.win32.join(dir, 'codex.cmd'), options, limits) &&
          await executableExists(entry, options, limits)) {
        return { command: process.execPath, args: [entry, ...args] };
      }
    }
  }
  throw new StageCliError('native_executable_unavailable');
}

function stopTree(child, signal, options, env) {
  if (options.terminate) { options.terminate(child, signal); return; }
  try {
    if ((options.platform ?? process.platform) === 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0) {
      const root = Object.entries(env).find(([key]) => key.toLowerCase() === 'systemroot')?.[1];
      check(typeof root === 'string' && path.win32.isAbsolute(root), 'cleanup_failed');
      (options.execFileSync ?? execFileSync)(path.win32.join(root, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
        shell: false, windowsHide: true, stdio: 'ignore', timeout: 1_000,
      });
    } else if (Number.isSafeInteger(child.pid) && child.pid > 0) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { try { child.kill(signal); } catch { /* The child may already have exited. */ } }
}

async function isolated(work) {
  let cwd;
  try {
    cwd = await mkdtemp(path.join(tmpdir(), 'gofer-stage-'));
    await chmod(cwd, 0o700);
    return await work(cwd);
  } catch (error) { throw error instanceof StageCliError ? error : new StageCliError('native_operation_failed'); }
  finally { if (cwd) { try { await rm(cwd, { recursive: true, force: true }); } catch { throw new StageCliError('cleanup_failed'); } } }
}

/** Bounded NDJSON/Content-Length transport; no SDK or shell dependency. */
async function runNative(host, args, mode, limits, options, cwd, work) {
  const env = delegateEnv(options.env ?? process.env, host);
  const command = await invocation(host, args, options, env, limits);
  const timeoutMs = remaining(limits);
  if ((options.platform ?? process.platform) === 'win32') {
    // Conservative UTF-16 bound includes quoting/escaping and the executable path.
    check([command.command, ...command.args].reduce((size, arg) => size + 2 * arg.length + 3, 0) < 30_000, 'command_line_limit');
  }
  let child;
  try {
    child = (options.spawn ?? options.spawnProcess ?? spawn)(command.command, command.args, {
      cwd, env, shell: false, windowsHide: true, detached: (options.platform ?? process.platform) !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch { throw new StageCliError('native_executable_unavailable'); }
  let closed = false;
  let closing = false;
  let expectedExit = false;
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let plain = '';
  let onMessage = () => {};
  const pending = new Map();
  let failure;
  let rejectFailure;
  const failed = new Promise((_, reject) => { rejectFailure = reject; });
  failed.catch(() => {});
  const fail = (code) => {
    if (closing || failure) return;
    failure = new StageCliError(code);
    rejectFailure(failure);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  };
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  const onAbort = () => fail('aborted');
  const timer = setTimeout(() => fail('timeout'), timeoutMs);
  limits.signal?.addEventListener('abort', onAbort, { once: true });
  const count = (chunk) => {
    limits.bytes += Buffer.byteLength(chunk);
    if (limits.bytes > limits.maxProtocolBytes) fail('protocol_output_limit');
    return !failure && !closing;
  };
  const send = (message) => {
    check(!failure && !closing, failure?.code ?? 'native_io_failed');
    const body = JSON.stringify(message);
    check(Buffer.byteLength(body) <= MAX_PROMPT * 8, 'input_limit');
    child.stdin.write(mode === 'rpc' ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : `${body}\n`);
  };
  const deliver = (body) => {
    const message = JSON.parse(body);
    check(object(message), 'invalid_protocol');
    if (mode === 'rpc') {
      check(message.jsonrpc === '2.0', 'invalid_protocol');
      if (message.method && message.id !== undefined) {
        // No server-initiated tool, permission, hook or user-input request is approved.
        send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not allowed' } });
        throw new StageCliError('unexpected_server_request');
      }
      if (!message.method) {
        const request = pending.get(message.id);
        check(request && (Object.hasOwn(message, 'result') !== Object.hasOwn(message, 'error')), 'invalid_protocol');
        pending.delete(message.id);
        if (Object.hasOwn(message, 'error')) { request.reject(new StageCliError('native_rpc_failed')); fail('native_rpc_failed'); }
        else request.resolve(message.result);
        return;
      }
    }
    onMessage(message);
  };
  child.stdout.on('data', (chunk) => {
    if (!count(chunk)) return;
    if (mode === 'plain') { plain += chunk.toString(); return; }
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    try {
      while (buffer.length && !failure) {
        if (mode === 'rpc') {
          const split = buffer.indexOf('\r\n\r\n');
          if (split < 0) { check(buffer.length <= 1_024, 'invalid_protocol'); break; }
          const header = buffer.subarray(0, split).toString('ascii');
          const matches = [...header.matchAll(/^Content-Length: ([0-9]+)$/gmi)];
          check(matches.length === 1 && split <= 1_024, 'invalid_protocol');
          const size = Number(matches[0][1]);
          check(Number.isSafeInteger(size) && size > 0 && size <= limits.maxProtocolBytes, 'protocol_output_limit');
          if (buffer.length < split + 4 + size) break;
          const body = buffer.subarray(split + 4, split + 4 + size).toString('utf8');
          buffer = buffer.subarray(split + 4 + size);
          deliver(body);
        } else {
          const split = buffer.indexOf(10);
          if (split < 0) break;
          const line = buffer.subarray(0, split).toString('utf8');
          buffer = buffer.subarray(split + 1);
          if (line.trim()) deliver(line);
        }
      }
    } catch (error) { fail(error instanceof StageCliError ? error.code : 'invalid_protocol'); }
  });
  child.stderr.on('data', count);
  child.stdin.on('error', () => fail('native_io_failed'));
  child.on('error', () => fail('native_executable_unavailable'));
  child.on('close', (code) => {
    closed = true;
    if (!closing && !expectedExit) {
      if (code !== 0) fail('native_process_failed');
      else if (buffer.length) fail('invalid_protocol');
    }
    resolveExit();
  });
  const io = {
    child, send, fail,
    expectExit() { expectedExit = true; },
    onMessage(handler) { onMessage = handler; },
    request(method, params = {}) {
      check(RPC_METHODS.has(method), 'invalid_protocol');
      return new Promise((resolve, reject) => {
        const requestId = ++sequence;
        pending.set(requestId, { resolve, reject });
        try { send({ jsonrpc: '2.0', id: requestId, method, params }); } catch (error) { pending.delete(requestId); reject(error); }
      });
    },
    async exit() { await exited; if (failure) throw failure; return plain; },
  };
  try {
    remaining(limits);
    const value = await Promise.race([work(io), failed, ...(mode === 'rpc' ? [exited.then(() => { throw new StageCliError('native_process_exited'); })] : [])]);
    if (failure) throw failure;
    remaining(limits);
    return value;
  } finally {
    closing = true;
    clearTimeout(timer);
    limits.signal?.removeEventListener('abort', onAbort);
    for (const request of pending.values()) request.reject(new StageCliError('native_io_closed'));
    const grace = async () => {
      if (closed) return;
      let timer;
      await Promise.race([exited, new Promise((resolve) => { timer = setTimeout(resolve, 150); })]);
      clearTimeout(timer);
    };
    try {
      if (!closed) { stopTree(child, 'SIGTERM', options, env); await grace(); }
      // A leader exiting on TERM does not prove its descendants exited.
      stopTree(child, 'SIGKILL', options, env);
      await grace();
    } finally {
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    }
    check(closed, 'cleanup_failed');
  }
}

// Checked against installed help and native multi-model-native-2026-09-06 evidence.
// https://code.claude.com/docs/en/cli-reference
// https://github.com/github/copilot-sdk (session.create availableTools; stdio JSON-RPC)
// https://developers.openai.com/codex/cli/reference
// https://docs.x.ai/build/cli/reference and /build/features/permissions
const claudeArgs = () => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--no-chrome', '--disable-slash-commands', '--settings', '{"disableAllHooks":true}'];
const copilotArgs = () => ['--headless', '--stdio', '--no-auto-update', '--disable-builtin-mcps', '--no-custom-instructions', '--no-remote', '--no-remote-export', '--no-bash-env'];

// Verified with Codex 0.153.4 features list / exec --help and the official
// config schema: https://learn.chatgpt.com/docs/config-schema.json
// This is NOT a tool-less guarantee: a local synthetic Responses probe still
// advertised apply_patch and request_user_input. Patch context validation reads
// outside files before write rejection, and CODEX_HOME/AGENTS.md still enters
// prompts despite project_doc_max_bytes=0. These are unresolved isolation gaps;
// event rejection is detection, not pre-execution containment or release proof.
const CODEX_DISABLED_FEATURES = Object.freeze([
  'shell_tool', 'unified_exec', 'shell_snapshot', 'code_mode', 'code_mode_host', 'code_mode_only',
  'apps', 'plugins', 'remote_plugin', 'hooks', 'multi_agent', 'multi_agent_v2',
  'view_image', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation',
  'memories', 'skill_search', 'skill_mcp_dependency_install', 'workspace_dependencies',
  'goals', 'in_app_local_automation', 'request_permissions_tool', 'tool_suggest', 'artifact', 'sleep_tool',
]);
const codexControls = () => [
  ...CODEX_DISABLED_FEATURES.flatMap(feature => ['--disable', feature]),
  '-c', 'web_search="disabled"', '-c', 'approval_policy="never"',
  '-c', 'shell_environment_policy.inherit="none"', '-c', 'project_doc_max_bytes=0',
  '-c', 'skills.include_instructions=false', '-c', 'skills.bundled.enabled=false',
  '-c', 'suppress_unstable_features_warning=true',
  '--enable', 'skip_host_skill_discovery',
];

/** Pure invocation description for the opt-in native qualification test. Does not execute. */
export function codexStageExecutionArgs(modelId) {
  check(id(modelId), 'invalid_model');
  return ['exec', '--json', '--ephemeral', '--ignore-user-config', '--strict-config', '--model', modelId,
    '--sandbox', 'read-only', '--skip-git-repo-check', ...codexControls(), '-'];
}

function familyFor(host, model) {
  if (host === 'copilot' && id(model.capabilities?.family)) return model.capabilities.family;
  if (host === 'codex') return 'openai-unverified-family';
  if (host === 'claude') return 'anthropic-unverified-family';
  if (host === 'grok') return 'xai-unverified-family';
  const value = model.id ?? '';
  if (/^claude-/.test(value)) return 'anthropic-unverified-family';
  if (/^(gpt-|o[0-9])/.test(value)) return 'openai-unverified-family';
  if (/^gemini-/.test(value)) return 'google-unverified-family';
  return `${host}-unverified-family`;
}

function compoundFor(model) {
  const flags = [model.nativeCompound, model.capabilities?.nativeCompound];
  check(flags.every((flag) => flag === undefined || typeof flag === 'boolean'), 'invalid_catalog');
  // Auto is a host-managed route, never evidence of an independent peer model.
  return model.id.toLowerCase() === 'auto' || flags.includes(true);
}

function catalog(host, entries, now) {
  check(Array.isArray(entries) && entries.length > 0 && entries.length <= 1_000, 'invalid_catalog');
  const seen = new Set();
  check(entries.every(object), 'invalid_catalog');
  const models = entries.filter((m) => m.id !== 'default' && m.available !== false && m.policy?.state !== 'disabled').map((m) => {
    check(object(m) && id(m.id) && !seen.has(m.id), 'invalid_catalog');
    if (m.policy) check(m.policy.state === 'enabled', 'invalid_catalog');
    seen.add(m.id);
    return { id: m.id, family: familyFor(host, m), available: true, nativeCompound: compoundFor(m) };
  });
  check(models.length > 0, 'catalog_unavailable');
  return { host, surface: 'cli', verified: true, observedAtMs: now(),
    readOnlyIsolation: !['antigravity', 'codex'].includes(host),
    ...(host === 'codex' ? { isolationReason: 'codex_read_isolation_unqualified' } : {}), models };
}

async function copilotCatalog(io) {
  const ping = await io.request('ping');
  check(ping?.protocolVersion === 3, 'unsupported_protocol');
  const auth = await io.request('auth.getStatus');
  check(auth?.isAuthenticated === true, 'authentication_unavailable');
  const response = await io.request('models.list');
  check(Array.isArray(response?.models), 'invalid_catalog');
  return response.models;
}

async function discover(host, limits, options) {
  return isolated(async (cwd) => {
    const now = options.now ?? Date.now;
    if (host === 'codex') {
      return runNative(host, ['app-server', '--listen', 'stdio://', ...codexControls()], 'external', limits, options, cwd, async (io) => {
        // discoverModels validates account/catalog binding but normalizes away optional fields.
        const compounds = new Map();
        io.onMessage((message) => {
          if (!Array.isArray(message.result?.data)) return;
          for (const model of message.result.data) {
            if (object(model) && id(model.model)) compounds.set(model.model, compoundFor({ ...model, id: model.model }));
          }
        });
        const result = await discoverModels({ host, surface: 'cli', expectedAuthMode: options.expectedAuthMode ?? 'chatgpt', readConfig: false, timeoutMs: Math.min(30_000, remaining(limits)), maxOutputBytes: limits.maxProtocolBytes }, {
          spawnProcess: () => io.child, now,
          invocation: () => ({ command: 'codex', args: [] }),
          terminate: (child, signal) => { io.expectExit(); stopTree(child, signal, options, delegateEnv(options.env ?? process.env, host)); },
        });
        remaining(limits);
        check(result.accountBinding === 'live-probe' && result.source?.accountScoped === true, 'catalog_unavailable');
        return catalog(host, result.models.map((model) => ({ ...model, nativeCompound: compounds.get(model.id) ?? false })), now);
      });
    }
    if (host === 'claude') {
      return runNative(host, claudeArgs(), 'ndjson', limits, options, cwd, async (io) => {
        let resolveCatalog;
        const response = new Promise((resolve) => { resolveCatalog = resolve; });
        io.onMessage((message) => {
          check(message.type !== 'control_request', 'unexpected_server_request');
          if (message.type === 'control_response') {
            check(message.response?.request_id === 'catalog' && message.response.subtype === 'success', 'native_rpc_failed');
            resolveCatalog(message.response.response);
          }
        });
        io.send({ type: 'control_request', request_id: 'catalog', request: { subtype: 'initialize', hooks: null } });
        const data = await Promise.race([response, io.exit().then(() => { throw new StageCliError('native_process_exited'); })]);
        check(Array.isArray(data?.models), 'invalid_catalog');
        return catalog(host, data.models.map((m) => ({ ...m, id: m.value })), now);
      });
    }
    if (host === 'copilot') return runNative(host, copilotArgs(), 'rpc', limits, options, cwd, async (io) => catalog(host, await copilotCatalog(io), now));
    return runNative(host, ['models'], 'plain', limits, options, cwd, async (io) => {
      io.child.stdin.end();
      const output = await io.exit();
      let entries;
      if (host === 'grok') {
        check(/^You are logged in with .+\.\r?$/m.test(output) && output.includes('Available models:'), 'authentication_unavailable');
        const section = output.split('Available models:')[1];
        entries = section.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
          const match = /^\s+[*-] ([^\s]+)(?: \(default\))?$/.exec(line);
          check(match, 'invalid_catalog');
          return { id: match[1] };
        });
      } else {
        entries = output.trim().split(/\r?\n/).map((line) => {
          const columns = line.split('\t');
          check(columns.length === 2 && columns[1].trim(), 'invalid_catalog');
          return { id: columns[0] };
        });
      }
      return catalog(host, entries, now);
    });
  });
}

const USAGE_FIELDS = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd'];
function usageNumber(value, cost = false) {
  if (value === undefined || value === null) return undefined;
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER && (cost || Number.isSafeInteger(value)), 'invalid_usage');
  return value;
}

/** inputTokens is full input; cachedInputTokens is its cache-read subset, not an
 * additional charge. Codex/Copilot input already includes cache; Claude/Grok's
 * Messages result reports disjoint uncached, cache-write and cache-read buckets.
 * https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 * https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md
 * Missing/null components leave totals unknown (omitted -> aggregateUsage null).
 * Use the result summary once, not overlapping modelUsage/iterations/TTL detail.
 * Unreported helper calls, cache-write breakdowns and prices are not estimated.
 */
function usageOf(host, raw, cost) {
  check(raw == null || object(raw), 'invalid_usage');
  let inputTokens;
  let cachedInputTokens;
  if (host === 'claude' || host === 'grok') {
    const uncached = usageNumber(raw?.input_tokens);
    const created = usageNumber(raw?.cache_creation_input_tokens);
    cachedInputTokens = usageNumber(raw?.cache_read_input_tokens);
    if ([uncached, created, cachedInputTokens].every((value) => value !== undefined)) {
      inputTokens = usageNumber(uncached + created + cachedInputTokens);
    }
  } else if (host === 'codex') {
    inputTokens = usageNumber(raw?.input_tokens);
    cachedInputTokens = usageNumber(raw?.cached_input_tokens);
  } else if (host === 'copilot') {
    inputTokens = usageNumber(raw?.inputTokens);
    cachedInputTokens = usageNumber(raw?.cacheReadTokens);
  }
  const fields = { inputTokens, cachedInputTokens,
    outputTokens: usageNumber(host === 'copilot' ? raw?.outputTokens : raw?.output_tokens),
    costUsd: usageNumber(cost, true) };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** Pure protocol decoder; exposing it does not grant an execution bypass. */
export function resultReader(host, modelId, limits) {
  let text = '';
  let complete = false;
  let usage = {};
  let usageSeen = false;
  const identities = new Set();
  const identity = (value) => { if (value !== undefined && value !== null) { check(id(value), 'invalid_model_identity'); identities.add(value); } };
  const answer = (value) => {
    check(typeof value === 'string', 'incomplete_result');
    check(Buffer.byteLength(value) <= limits.maxOutputBytes, 'output_limit');
    text = value;
  };
  return {
    event(e) {
      check(object(e), 'invalid_protocol');
      check(!['error', 'turn.failed', 'session.error'].includes(e.type) && e.is_error !== true, 'native_inference_failed');
      if (host === 'codex') {
        // Fail on known or future tool items, even if followed by a valid answer.
        // The CLI may already have attempted the tool before emitting this event;
        // rejected apply_patch validation can emit no tool item at all (0.153.4).
        if (['item.started', 'item.updated', 'item.completed'].includes(e.type)) {
          check(['agent_message', 'reasoning'].includes(e.item?.type), 'readonly_violation');
        }
        check(['thread.started', 'turn.started', 'turn.completed', 'item.started', 'item.updated', 'item.completed'].includes(e.type), 'readonly_violation');
        if (e.type === 'item.completed' && e.item?.type === 'agent_message') answer(e.item.text);
        if (e.type === 'turn.completed') { complete = true; usage = usageOf(host, e.usage); }
        // Codex exec currently omits model identity; do not substitute the selection.
      } else if (host === 'copilot') {
        if (e.type === 'assistant.message') { answer(e.data?.content); identity(e.data?.model); }
        if (e.type === 'assistant.usage') {
          const next = usageOf(host, e.data, e.data?.costUsd);
          if (!usageSeen) usage = next;
          else for (const key of USAGE_FIELDS) {
            if (usage[key] === undefined || next[key] === undefined) delete usage[key];
            else usage[key] = usageNumber(usage[key] + next[key], key === 'costUsd');
          }
          usageSeen = true;
          identity(e.data?.model);
        }
        if (e.type === 'session.idle') complete = true;
        check(!['tool.execution_start', 'permission.requested'].includes(e.type), 'readonly_violation');
      } else {
        if (e.type === 'assistant') identity(e.message?.model);
        if (e.type === 'control_request') throw new StageCliError('unexpected_server_request');
        if (e.type === 'result') {
          check(e.subtype === 'success', 'native_inference_failed');
          answer(e.result); complete = true;
          usage = usageOf(host, e.usage_is_incomplete === true ? undefined : e.usage,
            e.usage_is_incomplete === true || e.cost_is_partial === true ? undefined : e.total_cost_usd);
          if (!identities.size && object(e.modelUsage)) for (const value of Object.keys(e.modelUsage)) identity(value);
        }
      }
    },
    done() { return complete; },
    result() {
      check(complete && typeof text === 'string' && text.trim().length > 0, 'incomplete_result');
      check(Buffer.byteLength(text) <= limits.maxOutputBytes, 'output_limit');
      check(identities.size <= 1, 'model_identity_changed');
      return { text, selectedModelId: modelId, reportedModelId: [...identities][0] ?? null, usage };
    },
  };
}

/** Native CLI only. Options are trusted dependencies, never arbitrary commands/flags. */
export function createCliStageAdapter(host, options = {}) {
  check(Object.hasOwn(COMMANDS, host), 'unsupported_host');
  check(object(options) && Object.keys(options).every((key) => ['spawn', 'spawnProcess', 'terminate', 'execFileSync', 'platform', 'env', 'exists', 'now', 'expectedAuthMode', 'surface'].includes(key)));
  check(options.surface === undefined || options.surface === 'cli', 'unsupported_surface');
  return {
    host, surface: 'cli', enforcesCostLimit: false,
    async discover(input = {}) {
      const limits = limitsFor(input, true);
      const result = await discover(host, limits, options);
      check(Buffer.byteLength(JSON.stringify(result)) <= limits.maxOutputBytes, 'output_limit');
      return result;
    },
    async execute(input = {}) {
      const limits = limitsFor(input);
      check(input.readOnly === undefined || input.readOnly === true, 'readonly_required');
      check(input.maxCostUsd === undefined || input.maxCostUsd === null, 'hard_cost_limit_unavailable');
      check(host !== 'antigravity', 'readonly_isolation_unavailable');
      // NEW RELEASE BLOCKER: native read-only rejects writes, but patch validation
      // reads outside files and global AGENTS content still reaches the provider.
      // Preserve discovery/legacy orchestration; no option can waive qualification.
      check(host !== 'codex', 'codex_read_isolation_unqualified');
      check(id(input.modelId), 'invalid_model');
      check(typeof input.prompt === 'string' && input.prompt.trim().length > 0 && !input.prompt.includes('\0'), 'invalid_prompt');
      check(Buffer.byteLength(input.prompt) <= MAX_PROMPT, 'input_limit');
      const native = await discover(host, limits, options);
      check(native.readOnlyIsolation && native.models.some((model) => model.id === input.modelId), 'model_not_advertised');
      return isolated(async (cwd) => {
        const reader = resultReader(host, input.modelId, limits);
        if (host === 'copilot') {
          return runNative(host, copilotArgs(), 'rpc', limits, options, cwd, async (io) => {
            const entries = catalog(host, await copilotCatalog(io), options.now ?? Date.now);
            check(entries.models.some((model) => model.id === input.modelId), 'model_not_advertised');
            const sessionId = randomUUID();
            let sent = false;
            let resolveDone;
            const done = new Promise((resolve) => { resolveDone = resolve; });
            io.onMessage((message) => {
              if (message.method !== 'session.event') return;
              check(message.params?.sessionId === sessionId, 'session_mismatch');
              if (!sent) return;
              reader.event(message.params.event);
              if (reader.done()) resolveDone();
            });
            const session = await io.request('session.create', {
              sessionId, model: input.modelId, workingDirectory: cwd, availableTools: [], tools: [],
              mcpServers: {}, customAgents: [], skillDirectories: [], requestPermission: true,
              requestUserInput: false, streaming: false, infiniteSessions: { enabled: false },
              enableFileHooks: false, enableHostGitOperations: false, enableSkills: false,
              enableSessionStore: false, memory: { enabled: false },
            });
            check(session?.sessionId === sessionId, 'session_mismatch');
            sent = true;
            await io.request('session.send', { sessionId, prompt: input.prompt });
            await done;
            return reader.result();
          });
        }
        let args;
        if (host === 'codex') args = codexStageExecutionArgs(input.modelId);
        else if (host === 'claude') args = [...claudeArgs(), '--model', input.modelId];
        else {
          const promptFile = path.join(cwd, 'prompt.txt');
          await writeFile(promptFile, input.prompt, { mode: 0o600, flag: 'wx' });
          args = ['--prompt-file', promptFile, '--model', input.modelId, '--output-format', 'streaming-messages-json', '--sandbox', 'strict', '--tools', 'read_file', '--deny', 'Edit', '--deny', 'Bash', '--deny', 'MCPTool', '--no-subagents', '--disable-web-search', '--permission-mode', 'dontAsk', '--max-turns', '2'];
        }
        return runNative(host, args, 'ndjson', limits, options, cwd, async (io) => {
          io.onMessage((message) => reader.event(message));
          if (host === 'claude') io.send({ type: 'user', message: { role: 'user', content: input.prompt }, parent_tool_use_id: null, session_id: '' });
          else if (host === 'codex') io.child.stdin.write(input.prompt);
          io.child.stdin.end();
          await io.exit();
          return reader.result();
        });
      });
    },
  };
}
