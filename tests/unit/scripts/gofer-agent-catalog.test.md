# Shared Specialist Catalogue Contract

## Public API

```js
await readCatalogue({ root } = {});
await resolveAssignment(request, { root, verifyNativeProof } = {});
```

Both functions are asynchronous and dependency-free. `root` is the installation
or repository containing `.specify`, not the assignment's working directory.
It defaults to the helper's own installation root, never the shell's directory.
The returned catalogue includes `schemaVersion`, `stages`, `surfaces`, and `roles`.
Each role contains its canonical `body` reference, resolved relative `source`,
neutral `content`, and `contentSha256`.

The catalogue references all 42 existing role files. Packaged `agents/` takes
precedence; repository `.claude/agents/` is the fallback directory. A broken
package cannot silently mix in repository bodies. Escaping symlinks are rejected.
Only leading provider frontmatter is removed; the remaining responsibilities,
examples, constraints, and output formats are retained byte-for-byte.

## Assignment Inputs

```js
const assignment = await resolveAssignment({
  role: 'engineer-review',
  stage: '5_gofer_implement',
  task: 'T042: Review the agreed changes',
  revision: 'abcdef1234567890',
  scope: ['src', 'tests'],
  requiredChecks: ['acceptance', 'security'],
  surface: 'codex',
  availableModels: ['caller/model-a'],
  model: 'caller/model-a',
  mode: 'baseline',
});
```

- `role` must be a catalogue role ID; `stage` must be a catalogue command ID.
  Stage suitability and controller routing are deliberately not imposed here.
- `task` is a non-empty ID or one-line description. `revision` is a caller-owned
  revision token, not proof that Git or the filesystem is at that revision.
- `requiredChecks` is mandatory: 1-256 unique non-empty check IDs, each at most
  1,024 characters. Missing or changed checks invalidate an assignment's proof.
- `scope` is a non-empty array of distinct, normalized repository-relative
  literal paths. `.` explicitly means the whole workspace. Traversal, absolute
  paths, backslashes, and wildcard paths are rejected. Scope is not an access
  grant or sandbox; the controller must enforce it in the target workspace.
- `surface` is `claude`, `codex`, `copilot`, `vscode`, `grok`, `antigravity`, or
  legacy `gemini`. These records are declarations, not live availability proof.
- `availableModels` is required and may be empty. If `model` is supplied, it must
  exactly match an entry. Omitting it returns `model: null` with a limitation;
  neither role frontmatter nor list order chooses a model.
- Optional `mode` is `baseline` (default) or `independent`. An unqualified
  independent request returns `mode: 'blocked'`, `status: 'blocked'`,
  `dispatchAllowed: false`, `independent: false`, and explicit limitations.
  There is no silent fallback. The requested mode remains separately visible.
  Explicit baseline requests remain available without native qualification, but
  missing model selection blocks dispatch in either mode.
- Optional `capabilities` holds boolean `independentReadIsolation` and
  `independentExecution` self-declarations. They never qualify independence.

The result includes `roleContent`, `source`, the assignment fields, exact `binding`,
`requestedMode`, effective `mode`, `independent`, `qualification`, and structured
`limitations` (`code`, `message`), plus `status` and `dispatchAllowed`. It always reports `executed: false` and
`scopeEnforced: false`. A baseline request remains baseline even with native proof.
Consumers must use these fields, not infer independence from role prose.

`roleContent` prepends a normative assignment-authority notice to the unchanged
canonical body. Embedded provider examples, including Task calls, model names,
tool names and launch syntax, are advisory and non-authoritative. They do not
select models, grant permissions, authorize dispatch or prove independence.
`contentPolicy.providerExamples` also records `non-authoritative` for callers.
`contentSha256` hashes the canonical body, excluding this added notice.

## Native Proof Boundary

`nativeProof` must have `kind: 'native-proof'`, a `binding` identical to the
resolved assignment (role, stage, task, revision, scope, required checks, surface, selected model,
and content hash), a non-empty `evidence` reference array, and boolean
`independentReadIsolation` / `independentExecution` fields. Scope array order
is part of the exact binding. Missing or changed binding values fail closed.

Only the trusted controller may supply
`verifyNativeProof(proof, binding): boolean | Promise<boolean>`. The helper calls
it with detached copies after structural and binding checks. It must authenticate
original native-host evidence, check freshness and actual isolation/execution,
and return exactly `true`. Do not implement it by trusting the proof object's
own `verified` flag, capability declarations, or the presence of an evidence URL.
Verifier rejection, exceptions, or absence leave the assignment unqualified.
Both capabilities and an explicitly selected model are required for independence.
Tests use a simulated verifier; they do not qualify any real host or launch models.

## Validation

```sh
npm test -- tests/unit/scripts/gofer-agent-catalog.test.ts --retry 0 --reporter=default
node .specify/scripts/node/gofer-agent-catalog.mjs --help
node .specify/scripts/node/gofer-agent-catalog.mjs --list
node .specify/scripts/node/gofer-agent-catalog.mjs --list --json
```

Tests cover exact 42-role preservation, all seven surfaces, repository and relocated
dependency-free package layouts, frontmatter handling, invalid inputs, model
selection boundaries, stale proof, self-declarations, verifier failures, CLI help,
JSON/plain listings, and unsupported flags. The CLI is read-only and cannot resolve
and launch models. Generator, controller/stage integration, packaging changes,
commits, and publication remain outside this change.
