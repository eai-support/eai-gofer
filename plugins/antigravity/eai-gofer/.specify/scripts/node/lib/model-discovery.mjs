import { spawn, execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const SURFACES = ['cli', 'desktop', 'ide', 'vscode-extension'];
const AUTH = ['chatgpt', 'apiKey', 'subscription', 'local', 'loggedOut', 'unknown'];
const METHODS = ['initialize', 'account/read', 'model/list', 'config/read'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 512 && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const contextId = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(v);
class DiscoveryError extends Error {}
function check(ok, reason = 'invalid_input') { if (!ok) throw new DiscoveryError(reason); }
function fields(v, keys, reason = 'invalid_input') {
  check(object(v) && Object.keys(v).every((key) => keys.includes(key)), reason);
}
const reasonOf = (error) => error instanceof DiscoveryError ? error.message : 'discovery_unavailable';

function optionsFor(value, nowMs) {
  fields(value, ['host', 'surface', 'profile', 'expectedAuthMode', 'expectedAuthContextId', 'requestedModelId', 'requestedReasoningEffort', 'nowMs', 'maxAgeMs', 'timeoutMs', 'maxOutputBytes', 'readConfig', 'snapshot']);
  const o = { surface: 'cli', maxAgeMs: 60_000, timeoutMs: 10_000, maxOutputBytes: 1_048_576, readConfig: true, ...value };
  o.nowMs ??= nowMs;
  o.expectedAuthMode ??= o.host === 'codex' ? 'chatgpt' : undefined;
  check(text(o.host) && SURFACES.includes(o.surface) && integer(o.nowMs));
  check(integer(o.maxAgeMs) && o.maxAgeMs > 0 && o.maxAgeMs <= 300_000);
  check(integer(o.timeoutMs) && o.timeoutMs > 0 && o.timeoutMs <= 30_000);
  check(integer(o.maxOutputBytes) && o.maxOutputBytes >= 1_024 && o.maxOutputBytes <= 4_194_304);
  check(typeof o.readConfig === 'boolean');
  check(o.profile === undefined || (o.host === 'codex' && typeof o.profile === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(o.profile)));
  check(o.expectedAuthMode === undefined || AUTH.slice(0, 4).includes(o.expectedAuthMode));
  check(o.expectedAuthContextId === undefined || contextId(o.expectedAuthContextId));
  for (const key of ['requestedModelId', 'requestedReasoningEffort']) check(o[key] === undefined || text(o[key]));
  return o;
}

function nativeGuidance(o) {
  const common = 'Advertised models are not proof of successful inference. No settings are changed.';
  if (o?.host === 'grok-bot') return 'Grok Bot desktop is separate from Grok Build CLI and third-party wrappers. Model selection is service-managed; there is no documented model picker. Do not set a CLI model override. Bots share an account cloud computer, not separate security boundaries. Gofer has no verified native desktop catalog adapter here. ' + common;
  if (o?.host === 'grok') {
    if (o.surface === 'cli') return 'Grok Build CLI documents grok models and grok inspect --json. Check the installed help and current account/provider before using them. Gofer has no verified native catalog/account parser here. Skill model and effort fields are not applied; allowed-tools is not a permission boundary. Do not infer a model or read-only review from skill metadata. ' + common;
    return 'Identify this Grok app first: Grok Bot, the consumer app, or a third-party wrapper. None is certified by Grok Build CLI discovery. Use host grok-bot only for the official Grok Bot app and this exact Bot context. ' + common;
  }
  if (o?.host === 'antigravity') {
    if (o.surface === 'cli') return 'Antigravity CLI uses agy, not gemini. Check agy models in this account/provider context after checking installed help. Verify the actual output format; do not assume a JSON flag from a version number. Gofer has not verified a native catalog/account adapter here; do not guess its output schema, reasoning options, or model IDs. ' + common;
    return 'Use the model picker in this exact Antigravity desktop, standalone IDE, or VS Code extension session. These are separate clients. An agy or gemini CLI catalog does not verify this app, plan, or account. ' + common;
  }
  if (o?.host === 'gemini') {
    return 'Gemini is retired as a Gofer host. Select host antigravity with surface cli or desktop for that actual client. Do not reuse a Gemini catalog, model ID, credentials or settings. See https://antigravity.google/docs/cli/gcli-migration. ' + common;
  }
  return 'Use the native model picker for this exact host, surface and account. ' + common;
}

function emptyResult(o, reason, status = 'unavailable') {
  return {
    status, reason, host: o?.host ?? null, surface: o?.surface ?? null, profile: o?.profile ?? null,
    source: null, authMode: null, authContextId: null, accountBinding: null, observedAtMs: null, models: [], defaultModelId: null,
    configurationRead: false, configuredModelId: null, configuredModelAdvertised: null, configuredReasoningEffort: null,
    check: null, executionVerified: false,
    guidance: reason === 'profile_not_supported_by_app_server'
      ? 'This installed Codex rejects --profile for app-server. No requested-profile catalog was checked. Use the profile native picker or an account-bound native snapshot; the base catalog is not profile evidence.'
      : reason === 'reasoning_unverified'
      ? 'Read the resolved configuration (readConfig:true), or supply an exact reasoning override that the host will apply. Changing a model alone can inherit configured reasoning. No launch was verified.'
      : nativeGuidance(o),
  };
}

/** Pure check of trusted adapter evidence. Source labels are assertions, not authentication. */
export function checkModelCatalog(snapshot, options) {
  let o;
  try {
    o = optionsFor(options);
    if (o.host === 'gemini') return emptyResult(o, 'retired_host');
    if (snapshot == null) return emptyResult(o, 'native_discovery_unavailable');
    fields(snapshot, ['source', 'host', 'surface', 'profile', 'authMode', 'authContextId', 'observedAtMs', 'models', 'configurationRead', 'configuredModelId', 'configuredReasoningEffort'], 'invalid_catalog');
    fields(snapshot.source, ['kind', 'ref', 'accountScoped'], 'invalid_catalog');
    check(['native-catalog', 'codex-app-server'].includes(snapshot.source.kind) && text(snapshot.source.ref) && snapshot.source.accountScoped === true, 'invalid_catalog');
    check(text(snapshot.host) && SURFACES.includes(snapshot.surface) && AUTH.includes(snapshot.authMode) && integer(snapshot.observedAtMs), 'invalid_catalog');
    check(snapshot.source.kind !== 'codex-app-server' || (snapshot.host === 'codex' && snapshot.surface === 'cli'), 'invalid_catalog');
    if (snapshot.host !== o.host) return emptyResult(o, 'host_mismatch');
    if (snapshot.surface !== o.surface) return emptyResult(o, 'surface_mismatch');
    if ((snapshot.profile ?? null) !== (o.profile ?? null)) return emptyResult(o, 'profile_mismatch');
    if (snapshot.observedAtMs > o.nowMs) return emptyResult(o, 'future_catalog');
    if (o.nowMs - snapshot.observedAtMs > o.maxAgeMs) return emptyResult(o, 'stale_catalog');
    if (['loggedOut', 'unknown'].includes(snapshot.authMode)) return { ...emptyResult(o, 'authentication_unavailable'), authMode: snapshot.authMode };
    if (o.expectedAuthMode && snapshot.authMode !== o.expectedAuthMode) return { ...emptyResult(o, 'auth_mode_mismatch'), authMode: snapshot.authMode };
    if (!o.expectedAuthContextId) return emptyResult(o, 'auth_context_unverified');
    check(contextId(snapshot.authContextId), 'invalid_catalog');
    if (snapshot.authContextId !== o.expectedAuthContextId) return emptyResult(o, 'auth_context_mismatch');
    check(Array.isArray(snapshot.models) && snapshot.models.length <= 1_000, 'invalid_catalog');
    const ids = new Set();
    const models = snapshot.models.map((m) => {
      fields(m, ['id', 'isDefault', 'reasoningEfforts', 'defaultReasoningEffort'], 'invalid_catalog');
      check(text(m.id) && !ids.has(m.id) && typeof m.isDefault === 'boolean', 'invalid_catalog');
      ids.add(m.id);
      check(m.reasoningEfforts === null || (Array.isArray(m.reasoningEfforts) && m.reasoningEfforts.length <= 32 && m.reasoningEfforts.every(text) && new Set(m.reasoningEfforts).size === m.reasoningEfforts.length), 'invalid_catalog');
      check(m.defaultReasoningEffort === null || (text(m.defaultReasoningEffort) && m.reasoningEfforts?.includes(m.defaultReasoningEffort)), 'invalid_catalog');
      return { id: m.id, isDefault: m.isDefault, reasoningEfforts: m.reasoningEfforts === null ? null : [...m.reasoningEfforts], defaultReasoningEffort: m.defaultReasoningEffort };
    });
    const defaults = models.filter((m) => m.isDefault);
    check(defaults.length <= 1, 'invalid_catalog');
    for (const key of ['configuredModelId', 'configuredReasoningEffort']) check(snapshot[key] == null || text(snapshot[key]), 'invalid_catalog');
    check(snapshot.configurationRead === undefined || typeof snapshot.configurationRead === 'boolean', 'invalid_catalog');
    check(snapshot.configurationRead === true || (snapshot.configuredModelId == null && snapshot.configuredReasoningEffort == null), 'invalid_catalog');
    const configuredModelId = snapshot.configuredModelId ?? null;
    const modelId = o.requestedModelId ?? configuredModelId ?? defaults[0]?.id ?? null;
    const model = models.find((m) => m.id === modelId);
    // A model override does not clear the host's configured reasoning override.
    const effortKnown = o.requestedReasoningEffort !== undefined || (snapshot.configurationRead === true && snapshot.configuredReasoningEffort !== undefined);
    const effort = o.requestedReasoningEffort ?? (effortKnown ? snapshot.configuredReasoningEffort ?? model?.defaultReasoningEffort : null) ?? null;
    const reasoningAdvertised = effort === null || model?.reasoningEfforts == null ? null : model.reasoningEfforts.includes(effort);
    const reason = modelId === null ? 'host_default_unavailable' : !model ? 'model_not_advertised' :
      !effortKnown ? 'reasoning_unverified' : effort !== null && reasoningAdvertised !== true ? 'reasoning_not_advertised' : 'model_advertised';
    const result = {
      ...emptyResult(o, reason, reason === 'model_advertised' ? 'advertised' : 'unavailable'),
      source: { ...snapshot.source }, authMode: snapshot.authMode, authContextId: snapshot.authContextId,
      accountBinding: 'caller-asserted', observedAtMs: snapshot.observedAtMs, models,
      defaultModelId: defaults[0]?.id ?? null, configuredModelId,
      configurationRead: snapshot.configurationRead === true,
      configuredModelAdvertised: configuredModelId === null ? null : ids.has(configuredModelId),
      configuredReasoningEffort: snapshot.configuredReasoningEffort ?? null,
      check: { modelId, selectedFrom: o.requestedModelId ? 'requested' : configuredModelId ? 'configured' : modelId ? 'host-default' : 'none', modelAdvertised: modelId === null ? null : Boolean(model), reasoningEffort: reasoningAdvertised === true ? effort : null, reasoningAdvertised },
    };
    check(Buffer.byteLength(JSON.stringify(result)) <= o.maxOutputBytes, 'output_limit');
    return result;
  } catch (error) { return emptyResult(o, reasonOf(error), 'invalid'); }
}

const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };
function codexArgs(profile) {
  check(profile === undefined || (typeof profile === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(profile)));
  return [...(profile ? ['--profile', profile] : []), 'app-server', '--listen', 'stdio://'];
}
/** No .cmd shell execution: use an installed native binary or the fixed npm JS entrypoint.
 * Compatibility helper only: Windows filesystem checks here remain synchronous.
 * Default discovery uses the separate asynchronous, deadline-bound resolver below.
 */
export function codexInvocation(profile, { platform = process.platform, env = process.env, exists = isFile, node = process.execPath } = {}) {
  const args = codexArgs(profile);
  if (platform !== 'win32') return { command: 'codex', args };
  const search = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of search.split(';').filter(Boolean)) {
    const dir = directory.replace(/^"|"$/g, '');
    const native = path.win32.join(dir, 'codex.exe');
    if (exists(native)) return { command: native, args };
    const entry = path.win32.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (exists(path.win32.join(dir, 'codex.cmd')) && exists(entry)) return { command: node, args: [entry, ...args] };
  }
  throw new DiscoveryError('codex_executable_unavailable');
}

// Timed-out stat calls cannot be cancelled at the OS boundary. Retain their slots
// until settlement so repeated requests cannot fill the filesystem worker pool.
let pendingExecutableChecks = 0;
const MAX_EXECUTABLE_CHECKS = 2;
async function executableFile(file, deadline) {
  const remainingMs = deadline - performance.now();
  check(remainingMs > 0, 'discovery_timeout');
  check(pendingExecutableChecks < MAX_EXECUTABLE_CHECKS, 'executable_resolution_busy');
  pendingExecutableChecks += 1;
  const operation = (async () => {
    try { return (await stat(file)).isFile(); }
    catch { return false; }
    finally { pendingExecutableChecks -= 1; }
  })();
  let timer;
  try {
    const found = await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DiscoveryError('discovery_timeout')), remainingMs);
    })]);
    check(performance.now() < deadline, 'discovery_timeout');
    return found;
  } finally { clearTimeout(timer); }
}

async function resolveCodexInvocation(profile, deadline) {
  // Preserve the public helper and the exact native-before-npm PATH ordering.
  const args = codexArgs(profile);
  if (process.platform !== 'win32') return { command: 'codex', args };
  const search = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of search.split(';').filter(Boolean)) {
    const dir = directory.replace(/^"|"$/g, '');
    const native = path.win32.join(dir, 'codex.exe');
    if (await executableFile(native, deadline)) return { command: native, args };
    const entry = path.win32.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (await executableFile(path.win32.join(dir, 'codex.cmd'), deadline) &&
        await executableFile(entry, deadline)) return { command: process.execPath, args: [entry, ...args] };
  }
  throw new DiscoveryError('codex_executable_unavailable');
}

function terminate(child, signal) {
  if (process.platform === 'win32' && integer(child.pid) && child.pid > 0) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore', timeout: 1_000 });
      return true; // /T /F confirms forced tree termination, not just leader exit.
    } catch {
      try { child.kill(signal); } catch { /* Best effort only; not tree evidence. */ }
      throw new DiscoveryError('child_cleanup_unverified');
    }
  }
  try {
    if (integer(child.pid) && child.pid > 0) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { try { child.kill(signal); } catch { /* Already exited. */ } }
}

function connection(child, o, stop) {
  let pending = null;
  let sequence = 0;
  let buffer = '';
  let bytes = 0;
  let failure = null;
  let closed = false;
  let accountRead = false;
  let stderrTail = '';
  const fail = (reason) => {
    failure ??= new DiscoveryError(reason);
    pending?.reject(failure);
    pending = null;
  };
  const timer = setTimeout(() => fail('discovery_timeout'), o.timeoutMs);
  const count = (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > o.maxOutputBytes) fail('output_limit');
    return !failure;
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (!count(chunk)) return;
    buffer += chunk;
    let newline;
    while (!failure && (newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail('invalid_protocol'); break; }
      if (!object(message)) { fail('invalid_protocol'); break; }
      if (message.method !== undefined) {
        if (message.id !== undefined) fail('unexpected_server_request');
        else if (accountRead && message.method === 'account/updated') fail('account_changed');
        continue;
      }
      if (!pending || message.id !== pending.id || (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error'))) { fail('invalid_protocol'); break; }
      const current = pending;
      pending = null;
      if (Object.hasOwn(message, 'error')) current.reject(new DiscoveryError('rpc_failed'));
      else {
        if (current.method === 'account/read') accountRead = true;
        current.resolve(message.result);
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    if (!count(chunk)) return;
    // Recognize the installed CLI's startup rejection without exposing raw stderr.
    stderrTail = (stderrTail + chunk.toString()).slice(-4_096);
    if (o.profile && /--profile only applies to/i.test(stderrTail)) fail('profile_not_supported_by_app_server');
  });
  child.on('error', () => fail('codex_executable_unavailable'));
  child.on('close', () => { closed = true; fail('app_server_exited'); });
  child.stdin.on('error', () => fail('app_server_io_error'));
  const write = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  return {
    request(method, params) {
      if (failure) return Promise.reject(failure);
      if (!METHODS.includes(method) || pending) return Promise.reject(new DiscoveryError('invalid_protocol'));
      return new Promise((resolve, reject) => {
        pending = { id: ++sequence, method, resolve, reject };
        try { write({ id: sequence, method, params }); } catch { fail('app_server_io_error'); }
      });
    },
    initialized() { write({ method: 'initialized', params: {} }); },
    assertHealthy() { if (failure) throw failure; },
    async close() {
      clearTimeout(timer);
      let treeTerminated = false;
      const grace = async () => {
        if (closed) return;
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); child.removeListener('close', done); resolve(); };
          const timer = setTimeout(done, 250);
          child.once('close', done);
        });
      };
      try {
        try {
          child.stdin.end();
          if (!closed) { treeTerminated = stop(child, 'SIGTERM') === true; await grace(); }
        } finally {
          // Parent exit (including before cleanup) does not prove its descendants
          // exited. Kill the owned process group even when its leader has closed.
          if (!treeTerminated) stop(child, 'SIGKILL');
          await grace();
        }
      } finally {
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin.destroy();
      }
      if (!closed) throw new DiscoveryError('child_cleanup_failed');
    },
  };
}

async function codexCatalog(o, adapters) {
  check(['chatgpt', 'apiKey'].includes(o.expectedAuthMode), 'auth_mode_unsupported');
  const deadline = performance.now() + o.timeoutMs;
  // Trusted invocation overrides retain their existing synchronous contract.
  const command = adapters.invocation ? adapters.invocation(o.profile) :
    await resolveCodexInvocation(o.profile, deadline);
  check(performance.now() < deadline, 'discovery_timeout');
  const child = (adapters.spawnProcess ?? spawn)(command.command, command.args, {
    shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
  });
  const rpc = connection(child, { ...o, timeoutMs: Math.max(1, deadline - performance.now()) }, adapters.terminate ?? terminate);
  try {
    check(performance.now() < deadline, 'discovery_timeout');
    await rpc.request('initialize', { clientInfo: { name: 'gofer_model_discovery', version: '1.0.0' } });
    rpc.initialized();
    const account = await rpc.request('account/read', { refreshToken: false });
    check(object(account) && typeof account.requiresOpenaiAuth === 'boolean', 'invalid_account_response');
    const authMode = account.account === null ? 'loggedOut' : account.account?.type;
    if (authMode !== o.expectedAuthMode || !account.requiresOpenaiAuth) {
      throw Object.assign(new DiscoveryError(authMode === 'loggedOut' ? 'authentication_unavailable' : 'auth_mode_mismatch'), { authMode: AUTH.includes(authMode) ? authMode : 'unknown' });
    }
    const models = [];
    const cursors = new Set();
    let cursor = null;
    for (let page = 0; ; page += 1) {
      check(page < 20, 'pagination_limit');
      const response = await rpc.request('model/list', { cursor, limit: 100, includeHidden: false });
      check(object(response) && Array.isArray(response.data), 'invalid_catalog');
      for (const m of response.data) {
        check(object(m) && typeof m.hidden === 'boolean', 'invalid_catalog');
        if (m.hidden) continue;
        check(text(m.id) && text(m.model), 'invalid_catalog');
        check(m.supportedReasoningEfforts == null || Array.isArray(m.supportedReasoningEfforts), 'invalid_catalog');
        const efforts = m.supportedReasoningEfforts?.map((e) => e?.reasoningEffort) ?? null;
        models.push({ id: m.model, isDefault: m.isDefault, reasoningEfforts: efforts, defaultReasoningEffort: efforts?.includes(m.defaultReasoningEffort) ? m.defaultReasoningEffort : null });
      }
      check(models.length <= 1_000, 'catalog_limit');
      cursor = response.nextCursor ?? null;
      if (cursor === null) break;
      check(text(cursor) && !cursors.has(cursor), 'invalid_pagination');
      cursors.add(cursor);
    }
    let configuredModelId = null;
    let configuredReasoningEffort = null;
    let configurationRead = false;
    if (o.readConfig) {
      try {
        const response = await rpc.request('config/read', { includeLayers: false });
        check(object(response?.config), 'invalid_config_response');
        configuredModelId = response.config.model ?? null;
        configuredReasoningEffort = response.config.model_reasoning_effort ?? null;
        configurationRead = true;
      } catch (error) { if (!(error instanceof DiscoveryError) || error.message !== 'rpc_failed') throw error; }
    }
    rpc.assertHealthy();
    return {
      source: { kind: 'codex-app-server', ref: 'account/read + model/list', accountScoped: true },
      host: 'codex', surface: 'cli', profile: o.profile ?? null, authMode, authContextId: randomUUID(), observedAtMs: (adapters.now ?? Date.now)(),
      models, configurationRead, configuredModelId, configuredReasoningEffort,
    };
  } finally { await rpc.close(); }
}

/** Read-only discovery: no thread/turn, authentication or configuration mutation requests.
 * The host can maintain its own logs/cache. Native snapshots are trusted adapter input.
 */
export async function discoverModels(options, adapters = {}) {
  let o;
  try {
    o = optionsFor(options, (adapters.now ?? Date.now)());
    if (o.host === 'gemini') return emptyResult(o, 'retired_host');
    if (o.snapshot !== undefined) return checkModelCatalog(o.snapshot, o);
    if (o.host !== 'codex' || o.surface !== 'cli') return emptyResult(o, 'native_discovery_unavailable');
    check(o.expectedAuthContextId === undefined, 'auth_context_requires_snapshot');
    const snapshot = await codexCatalog(o, adapters);
    const result = checkModelCatalog(snapshot, { ...o, expectedAuthContextId: snapshot.authContextId, nowMs: (adapters.now ?? Date.now)() });
    return { ...result, accountBinding: result.source ? 'live-probe' : null };
  } catch (error) {
    const result = emptyResult(o, reasonOf(error), o ? 'unavailable' : 'invalid');
    if (error instanceof DiscoveryError && AUTH.includes(error.authMode)) result.authMode = error.authMode;
    return result;
  }
}
