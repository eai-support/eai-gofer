#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { discoverModels } from './lib/model-discovery.mjs';

const HELP = `Usage: node gofer-model-discovery.mjs --host <host> [options]
  --host <host>            Product, e.g. codex, claude, copilot, antigravity, grok, grok-bot
  --surface <surface>       cli (default), desktop, ide, vscode-extension
  --profile <name>          Codex CLI profile, passed before app-server
  --requested-model <id>    Check the exact advertised ID, not an alias/upgrade
  --reasoning <effort>      Check exact effort for that model; unknown is omitted
  --auth-mode <mode>        chatgpt (Codex default), apiKey, subscription, local
  --input <path>           Read a trusted native catalog snapshot instead of probing
  --auth-context <id>      Required with --input: expected current opaque account context
  --timeout-ms <ms>         Total probe limit, 1-30000 (default 10000)
  --max-age-ms <ms>         Snapshot freshness, 1-300000 (default 60000)
  --max-output-bytes <n>    Combined server output bound, 1024-4194304 (default 1048576)
  --no-config              Catalog only; inherited reasoning remains unverified
  --json                   Print structured result; exit 0 advertised, 1 otherwise
  --help                   Show this contract without discovery or input reads

Snapshot JSON shape (no account details or credentials):
{ "source": {"kind":"native-catalog", "ref":"native model picker", "accountScoped":true},
  "host":"HOST", "surface":"cli", "authMode":"subscription", "authContextId":"opaque-account-context", "observedAtMs":EPOCH_MS,
  "models":[{"id":"EXACT_ID", "isDefault":true,
             "reasoningEfforts":null, "defaultReasoningEffort":null}],
  "configurationRead":false, "configuredModelId":null, "configuredReasoningEffort":null }
Optional profile must match the requested profile exactly. Source kind is native-catalog
or codex-app-server. Authentication must be explicit and bound to the current account.
Other authenticated modes: chatgpt, apiKey, local. loggedOut/unknown are unavailable.
The trusted adapter supplies this evidence; labels are not cryptographic proof.
Supplied snapshots require a matching --auth-context and remain caller-asserted,
not live account verification. Use an opaque non-secret ID (letters/digits/:/_/-;
max 128 characters), never an email or token. Live context IDs identify this probe
only, not a persistent account fingerprint. --auth-context is only for snapshots.
Model IDs and reasoning strings are exact, nonempty, trimmed, <=512 characters.
Normalized model id is the selectable identifier: Codex Model.model, not the
native catalog row Model.id or displayName. No alias/upgrade substitution is made.
At most 1000 models/32 unique efforts per model; null efforts mean unknown.
Only one model may be host-default; no default, upgrade or effort is guessed.
Unknown fields, duplicate IDs, stale/future evidence and mismatched scope fail closed.

Codex CLI uses initialize -> initialized -> account/read(refreshToken:false) ->
model/list(includeHidden:false, paginated) -> optional config/read(includeLayers:false).
No thread/turn, login, token refresh, configuration writes or inference are requested.
App-server may maintain its own runtime logs/cache. Raw account/config/error output
is never printed. The child is cleaned up on success, timeout and failure.
CLI discovery does NOT establish desktop/extension capabilities: those need snapshots.
Google products are separate: --host antigravity --surface cli means agy;
desktop/ide/vscode-extension mean separate Antigravity desktop, standalone IDE,
and VS Code extension clients, not its CLI.
The old gemini host is retired and returns retired_host, including with a
supplied catalog. Choose antigravity cli or desktop explicitly; never alias
models or credentials from the former host.
Native automatic Google catalog adapters are not yet verified. agy models is
documented; JSON listing needs CLI 1.1.12+. Do not guess response fields or
account binding. The helper reports unavailable without spawning these clients.
Supplied catalogs must still match the exact product, client and account.
Grok Build uses --host grok --surface cli. The official Grok Bot app uses
--host grok-bot --surface desktop. Other Grok desktop wrappers need their own
verified identity. grok models and grok inspect --json are documented, but
Gofer has no verified native parser/account adapter here. Skill model/effort
metadata is not applied by Grok Build; allowed-tools does not restrict tools.
No Grok process is spawned by this model discovery helper.
Some Codex versions accept --profile in help but reject it for a running app-server;
that reports profile_not_supported_by_app_server, never a cloud-certified base catalog.
Output separates models, defaultModelId, configuredModelId and check, with status
advertised/unavailable/invalid and executionVerified:false. check.reasoningEffort
is null unless advertised for the checked model. configurationRead:false means the
resolved configuration is unknown. A requested model never changes user settings.
Reasoning precedence: exact explicit --reasoning override, inherited configured
effort (even when --requested-model changes), then the host model default only
when the configuration was read and has no effort override. Without configuration
or an explicit override, reasoning_unverified blocks a successful check. Execution
bridges must keep readConfig:true and apply any explicitly requested effort.
Catalog availability is not proof of successful live inference. Use the native
model picker for the exact host/surface/account when discovery is unavailable.
`;

const args = process.argv.slice(2);
try {
  const values = { '--host': 'host', '--surface': 'surface', '--profile': 'profile', '--requested-model': 'requestedModelId', '--reasoning': 'requestedReasoningEffort', '--auth-mode': 'expectedAuthMode', '--auth-context': 'expectedAuthContextId', '--timeout-ms': 'timeoutMs', '--max-age-ms': 'maxAgeMs', '--max-output-bytes': 'maxOutputBytes' };
  const numeric = new Set(['timeoutMs', 'maxAgeMs', 'maxOutputBytes']);
  const seen = new Set();
  const options = {};
  let input;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error();
    seen.add(arg);
    if (['--help', '--json'].includes(arg)) continue;
    if (arg === '--no-config') { options.readConfig = false; continue; }
    if (arg !== '--input' && !Object.hasOwn(values, arg)) throw new Error();
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error();
    if (arg === '--input') input = value;
    else {
      const key = values[arg];
      if (numeric.has(key) && !/^\d+$/.test(value)) throw new Error();
      options[key] = numeric.has(key) ? Number(value) : value;
    }
  }
  if (seen.has('--help')) process.stdout.write(HELP);
  else {
    if (input !== undefined) {
      const file = await open(input, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
      try {
        if (!(await file.stat()).isFile()) throw new Error();
        const bytes = Buffer.alloc(1_048_577);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 1_048_576) throw new Error();
        options.snapshot = JSON.parse(bytes.toString('utf8', 0, bytesRead));
      } finally { await file.close(); }
    }
    const result = await discoverModels(options);
    process.stdout.write(seen.has('--json') ? `${JSON.stringify(result)}\n` : `${result.status}: ${result.reason}\n${result.guidance}\n`);
    if (result.status !== 'advertised') process.exitCode = 1;
  }
} catch {
  const result = { status: 'invalid', reason: 'invalid_arguments_or_snapshot', executionVerified: false };
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(result)}\n` : `${result.reason}\n`);
  process.exitCode = 1;
}
