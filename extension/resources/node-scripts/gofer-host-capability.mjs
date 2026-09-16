#!/usr/bin/env node
/**
 * Read-only host discovery for the verified execution protocol. It never
 * selects a model or launches an agent because those controls are host-owned.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOSTS = Object.freeze({
  antigravity: { program: 'agy', args: ['--version'] },
  claude: { program: 'claude', args: ['--version'] },
  codex: { program: 'codex', args: ['--version'] },
  copilot: { program: 'copilot', args: ['--version'] },
  grok: { program: 'grok', args: ['--version'] },
  vscode: { program: 'code', args: ['--version'] },
});

// Generated and legacy surfaces use these names. Keep alias resolution here so
// a command surface cannot silently select a different host.
export const HOST_ALIASES = Object.freeze({
  'claude-code': 'claude',
  'openai-codex': 'codex',
  'github-copilot': 'copilot',
  'visual-studio-code': 'vscode',
  gemini: 'antigravity',
  xai: 'grok',
});

function fail(message) { throw new Error(`Host capability: ${message}`); }

function hostName(value) {
  if (value === 'auto') return null;
  const canonical = HOST_ALIASES[value] ?? value;
  if (!Object.hasOwn(HOSTS, canonical)) fail(`unsupported host: ${value}`);
  return canonical;
}

const safeModel = value => value && typeof value.id === 'string' && value.id.trim() &&
  (value.reasoningEfforts === undefined || (Array.isArray(value.reasoningEfforts) &&
    value.reasoningEfforts.every(item => typeof item === 'string' && item.trim())));
const parseTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

/**
 * A capability receipt is created by a host-specific evaluator after it reads
 * the active host runtime. It is model availability evidence only: it does not
 * claim execution, isolation, permission, or a selected model.
 */
export function createCapabilityReceipt({ host, evaluatorVersion, evaluatedAt, expiresAt, models, evaluationId }) {
  const canonical = hostName(host);
  if (!canonical || typeof evaluatorVersion !== 'string' || !evaluatorVersion.trim() ||
      !Array.isArray(models) || !models.every(safeModel) ||
      new Set(models.map(model => model.id)).size !== models.length ||
      typeof evaluationId !== 'string' || !evaluationId.trim() ||
      parseTime(evaluatedAt) === null || parseTime(expiresAt) === null || parseTime(expiresAt) <= parseTime(evaluatedAt)) {
    fail('invalid capability receipt');
  }
  return Object.freeze({ schemaVersion: 1, host: canonical, evaluator: 'host-runtime', evaluatorVersion,
    evaluationId, evaluatedAt, expiresAt, models: models.map(model => ({ ...model })),
    execution: 'unqualified', isolation: 'unqualified', toolPermissions: 'unqualified' });
}

export function selectLiveModel(receipt, { host, modelId, now = Date.now() }) {
  const canonical = hostName(host);
  if (!receipt || receipt.schemaVersion !== 1 || receipt.host !== canonical ||
      receipt.evaluator !== 'host-runtime' || parseTime(receipt.evaluatedAt) === null ||
      parseTime(receipt.expiresAt) === null || parseTime(receipt.expiresAt) <= now ||
      !Array.isArray(receipt.models) || !receipt.models.every(safeModel) ||
      typeof modelId !== 'string' || !modelId.trim()) fail('live model capability is unavailable');
  const model = receipt.models.find(item => item.id === modelId);
  if (!model) fail('model is not present in the current host receipt');
  return Object.freeze({ host: canonical, model: { ...model }, evaluationId: receipt.evaluationId,
    receiptVersion: receipt.schemaVersion, expiresAt: receipt.expiresAt });
}

async function runProgram({ program, args }) {
  return new Promise(resolve => {
    let output = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(program, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const collect = chunk => { output = `${output}${chunk}`.slice(0, 8192); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => finish({ ok: false, version: null }));
    child.on('close', code => finish({ ok: code === 0, version: code === 0 ? output.trim() || null : null }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, version: null });
    }, 3000);
  });
}

/**
 * Inspect one installed host. A version probe only proves that the executable
 * is reachable. Model availability and isolation remain runtime evidence.
 */
export async function inspectHost(host, { run = runProgram } = {}) {
  const id = hostName(host);
  if (!id) {
    return {
      schemaVersion: 1,
      host: null,
      aliases: HOST_ALIASES,
      status: 'host-name-required',
      models: [],
      modelDiscovery: 'host-runtime-required',
      independentExecution: 'unqualified',
      nextAction: 'Use the current coding app name. Do not guess model IDs.',
    };
  }
  const probe = await run(HOSTS[id]);
  return {
    schemaVersion: 1,
    host: id,
    aliases: Object.fromEntries(Object.entries(HOST_ALIASES).filter(([, canonical]) => canonical === id)),
    status: probe?.ok === true ? 'available' : 'unavailable',
    executable: HOSTS[id].program,
    version: typeof probe?.version === 'string' ? probe.version : null,
    models: [],
    modelDiscovery: 'host-runtime-required',
    independentExecution: 'unqualified',
    nextAction: probe?.ok === true
      ? 'Use the host runtime to disclose available models and permissions before delegation.'
      : 'Install or open the selected host. Do not substitute another host.',
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node gofer-host-capability.mjs --host <host|auto> --json\n');
    return;
  }
  if (args.length !== 3 || args[0] !== '--host' || args[2] !== '--json') fail('use --host <host|auto> --json');
  process.stdout.write(`${JSON.stringify(await inspectHost(args[1]))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
