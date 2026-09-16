#!/usr/bin/env node
/**
 * Read-only host discovery for the verified execution protocol. It never
 * selects a model or launches an agent because those controls are host-owned.
 */
import { spawn } from 'node:child_process';

const HOSTS = Object.freeze({
  antigravity: { program: 'antigravity', args: ['--version'] },
  claude: { program: 'claude', args: ['--version'] },
  codex: { program: 'codex', args: ['--version'] },
  copilot: { program: 'copilot', args: ['--version'] },
  grok: { program: 'grok', args: ['--version'] },
  vscode: { program: 'code', args: ['--version'] },
});

function fail(message) { throw new Error(`Host capability: ${message}`); }

function hostName(value) {
  if (value === 'auto') return null;
  if (!Object.hasOwn(HOSTS, value)) fail(`unsupported host: ${value}`);
  return value;
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

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
