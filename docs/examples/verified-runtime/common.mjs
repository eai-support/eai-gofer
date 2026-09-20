// Shared helpers for the worked examples in docs/verified-autonomous-runtime.md.
// These are operator examples, not production entry points. They print
// progress, keep secrets out of output, and stop on the first problem.
import { accessSync, constants, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS = path.resolve(here, '../../../.specify/scripts/node');
export const ISOLATION = 'git-worktree+local-os-sandbox';

export const log = message => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

/** Parse `--name value` pairs. `spec` lists the allowed names. */
export function parseArgs(argv, spec) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, '');
    if (!spec.includes(name) || argv[index + 1] === undefined || name in values) {
      throw new Error(`Usage: ${spec.map(item => `--${item} <value>`).join(' ')}`);
    }
    values[name] = argv[index + 1];
  }
  return values;
}

export function requireAbsolute(values, names) {
  for (const name of names) {
    if (!path.isAbsolute(values[name] ?? '')) throw new Error(`--${name} must be an absolute path`);
  }
}

/** The first `codex` on PATH, resolved to its real file. Version-specific
 * install paths change on upgrade, so never hard-code one. The capability
 * issuer separately verifies that this executable is OpenAI-signed. */
export function findCodex() {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, 'codex');
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch { /* try the next entry */ }
  }
  throw new Error('codex was not found on PATH');
}

export function rate(text) {
  const [input, output] = String(text).split(',').map(Number);
  if (!(input >= 0) || !(output >= 0)) throw new Error('rates look like "2,12" (US$ per million input,output tokens)');
  return { inputUsdPerMillion: input, outputUsdPerMillion: output };
}
