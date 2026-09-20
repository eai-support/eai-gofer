# Verified autonomous runtime: how routing is earned, and how to run it by hand

Gofer does not trust a fixed model name. It routes work to a model only when
three things are true at the same moment:

1. A **fresh signed capability receipt** says which models this machine's coding
   app really offers, in a verified isolation class.
2. A **signed independent benchmark** shows that model passing held-out tasks
   three times each. The result is bound to that exact receipt.
3. The **ledger** has authorised the task: reservation, lease, scope, approval.

If any of these is missing, stale or altered, Gofer refuses. This page explains
each step so that a person can do them by hand. Some steps need a person on
purpose: choosing a passphrase, running `sudo`, signing, and approving spend.

The policy file `.specify/memory/gofer-model-policy.yaml` is **advisory**. It
narrows what is allowed. It never chooses a model and never proves a capability.

```mermaid
flowchart LR
    Cap[Signed capability receipt] --> Bench[Benchmark: 4 cases x 3 runs]
    Bench --> Sign[Person signs: passphrase]
    Sign --> Gate{Routing gate}
    Cap --> Gate
    Gate -->|all present| Route[Model selected]
    Gate -->|anything missing| Refuse[Refuse]
    Route --> Ledger[Ledger: reserve, lease, authorise]
    Ledger --> Task[Task in verified isolation]
    Task -->|cancel| Recon[Reconcile lease, replacement worktree]
    Recon --> Task
```

## What is proven today, and what is not

Proven on one macOS machine with the OpenAI Codex app: a real worker ran in a
verified sandbox, was cancelled, was reconciled, and resumed. See
[the readiness assessment](verified-autonomous-runtime-readiness.md) for the
score, the evidence and the gaps. Other coding apps, Linux and Windows fail
closed. They are never given a static fallback.

## Prerequisites

| Need                                   | Check                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| macOS, Node 24, `git`, `jq`, `openssl` | `node --version`                                                                                            |
| EAI CLI 3.16.0 or later                | `eai start <worktree> --isolation-check --surface codex-cli --format json` returns `eai.local-isolation/v2` |
| Codex CLI, signed by OpenAI            | `codesign -dv $(readlink -f $(command -v codex))` shows `TeamIdentifier=2DC432GLL2`                         |
| Codex signed in                        | `codex login status`                                                                                        |
| An admin account for one `sudo` step   | you know the password                                                                                       |

Codex may upgrade itself. Never hard-code its install path. The examples find it
on `PATH` each time.

## One-time setup per machine

All keys live in `~/.eai-gofer-trust`. The worker sandbox can **read** your home
folder (it cannot write). That is why the verifier key is encrypted and its
registry is root-owned. Do not skip those steps.

### 1. Stage the capability key

Gofer bootstrap creates it automatically. Check it exists:

```bash
ls ~/.eai-gofer-trust/staged-keys/capability-evaluator.private.pem
```

### 2. Activate the capability key (a trust decision: read it first)

The capability key only vouches for _which models exist_. It is not the
independence key. Activating it lets this machine issue receipts. Its private
key is a plaintext file, so a worker could read it. That is a known limit.

```bash
TRUST=~/.eai-gofer-trust
KEYID=$(jq -r '.[] | select(.name=="capability-evaluator") | .keyId' $TRUST/staged-keys/identities.json)
jq --arg id "$KEYID" --rawfile pem $TRUST/staged-keys/capability-evaluator.public.pem \
  '.evaluators += [{keyId:$id,host:"codex",evaluator:"gofer-native-host-evaluator",publicKeyPem:$pem}]' \
  $TRUST/trusted-evaluators.json > $TRUST/trusted-evaluators.json.new
chmod 600 $TRUST/trusted-evaluators.json.new && mv $TRUST/trusted-evaluators.json.new $TRUST/trusted-evaluators.json
mkdir -p $TRUST/active-keys && chmod 700 $TRUST/active-keys
install -m 600 $TRUST/staged-keys/capability-evaluator.private.pem $TRUST/active-keys/codex-evaluator.private.pem
printf '{"schemaVersion":1,"host":"codex","evaluator":"gofer-native-host-evaluator","keyId":"%s"}\n' "$KEYID" \
  > $TRUST/active-keys/codex-evaluator.json && chmod 600 $TRUST/active-keys/codex-evaluator.json
```

### 3. Create the verifier key (this is the independence key)

Run this **yourself, in a terminal**. It asks for a passphrase of at least 12
characters, twice. Nothing is echoed. Never run it through an agent.

```bash
node .specify/scripts/node/gofer-verifier-key-ceremony.mjs
```

It stores only an encrypted key. It prints two `sudo` commands. Run them. They
install a registry that only an administrator can change:

```bash
sudo mkdir -p "/Library/Application Support/EAI Gofer"
sudo install -o root -g wheel -m 0644 ~/.eai-gofer-trust/verifier-registry.pending.json \
  "/Library/Application Support/EAI Gofer/verifier-registry.json"
```

A verifier key that your own account registered is **ignored**. Only the
root-owned registry counts. To add a second key later, run the ceremony again;
it keeps earlier entries.

Delete any old plaintext verifier key. A worker can read it:

```bash
rm -f ~/.eai-gofer-trust/staged-keys/heldout-verifier.private.pem
```

Check the registry is trusted the way production checks it:

```bash
ls -l "/Library/Application Support/EAI Gofer/verifier-registry.json"   # root wheel, -rw-r--r--
```

### 4. Pin the held-out corpus

The four-case corpus (bug fix, refactor, cross-service contract, security
sensitive) lives in `~/.eai-gofer-trust/corpora/<id>/` and is pinned by
`~/.eai-gofer-trust/heldout-corpus.json` (its hash). The loader refuses a
changed corpus. Keep it out of the repository so workers never see it.

## Each benchmark cycle

A receipt lives up to 6 hours. The benchmark result is bound to that exact
receipt, so do steps 5 to 8 inside one receipt's life. Use a 4-hour receipt.

Use the examples in
[`docs/examples/verified-runtime/`](examples/verified-runtime). They are
operator examples adapted from the live proof. `<repo>` is a clean checkout of
this repository.

### 5. Issue a fresh receipt (free)

```bash
node docs/examples/verified-runtime/issue-receipt.mjs \
  --repo <repo> --out /abs/work/receipt.json --ttl-minutes 240
```

### 6. Run the benchmark (spends money)

Decide the caps **first**, and write down who approved them. Rates are list
price in US$ per million tokens (input,output). The worker and reviewer must be
different models. In the live proof, a full run cost about US$5.7 for 12 worker
runs and 12 reviews.

```bash
node docs/examples/verified-runtime/run-benchmark.mjs \
  --repo <repo> --receipt /abs/work/receipt.json --out /abs/work/result.json \
  --worker-model gpt-5.6-terra --worker-rate 2,12 \
  --reviewer-model gpt-5.6-sol --reviewer-rate 4,20 \
  --approval "approved by <name> on <date>" --max-run-usd 2 --max-total-usd 8
```

Each run is reserved at its worst case before it starts, so the total cannot
pass the cap. A run that cannot be metered, or that times out, is charged in
full. Move any earlier `receipts` folder out of the corpus first. The executor
will not overwrite an earlier run.

The script ends by printing a `snapshot` id. As a free extra check, re-run the
protected checks yourself in the offline sandbox. They must agree 12 of 12.

### 7. Sign (a person, at a terminal)

The command refuses to run without a terminal. It re-runs all 12 protected
checks itself before it signs. Pick an attestation lifetime that fits your work,
up to 240 minutes.

```bash
node .specify/scripts/node/gofer-benchmark-sign.mjs \
  --workspace-root <repo> --snapshot-id <snapshot id> \
  --capability-receipt /abs/work/receipt.json \
  --out /abs/work/attestation.json --ttl-minutes 180
```

### 8. Check the gate (free)

```bash
node docs/examples/verified-runtime/verify-routing.mjs \
  --repo <repo> --receipt /abs/work/receipt.json --attestation /abs/work/attestation.json
```

You should see three lines: it refuses without the benchmark, selects a model
with it, and refuses a tampered verdict.

### 9. Run a routed task

```bash
node .specify/scripts/node/gofer-run-verified-task.mjs --workspace <repo> \
  --capability-receipt /abs/work/receipt.json --benchmark /abs/work/attestation.json
```

Expect `"status":"verified"`. The report's `nativeQualification` field is a
fixed value and does not measure this evidence. Read the ledger and journal
instead.

### 10. Prove cancellation and resume (spends a little)

```bash
node docs/examples/verified-runtime/cancel-resume.mjs --repo <repo> \
  --receipt /abs/work/receipt.json --attestation /abs/work/attestation.json --out /abs/work/evidence
```

Check `evidence/verified-execution.jsonl` for `cancelled`, `cancel_reconciled`,
`resumed`, `verified`. Check `runtime-ledger.jsonl` for `cancel-reconciled` on
the first lease and `commit-authorize` on the second lease only.

## Spend rules

- Never start a paid run without a written cap and an approver.
- Keep a running total. The examples print it after every step.
- A usage limit from the provider stops a run at once and spends nothing.
- Buying credits is a person's decision, never an agent's.

## Problems you may meet

| Symptom                                                    | Cause                                                                | Fix                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `LOCAL_SANDBOX_REQUIRED`                                   | EAI CLI too old                                                      | Update it. Version 3.16.0 or later                  |
| Issuer works but a benchmark fails at the first call       | Receipt lifetime too short (default 5 minutes)                       | Issue with `--ttl-minutes 240`                      |
| `spawn ... codex ENOENT`                                   | Codex upgraded and its path changed                                  | Use the examples, which find it on `PATH`           |
| `You've hit your usage limit`                              | Provider limit                                                       | Wait for the reset, or a person adds credits        |
| `BENCHMARK_EXECUTOR_REQUIRED` at once                      | An earlier `receipts` folder exists, or the first worker call failed | Move the old folder aside and read the worker error |
| Gate says `TRUSTED_BENCHMARK_REQUIRED`                     | Attestation altered, expired, or bound to another receipt            | Sign again for the current receipt                  |
| `INDEPENDENT_BENCHMARK_REQUIRED`                           | No attestation given                                                 | Complete steps 6 to 8                               |
| `CALL_LIMIT` blocks a task                                 | Call limit too low (a task needs 9 calls)                            | Use a limit of 12 or more                           |
| Resume refuses                                             | Loop allows one attempt                                              | The smoke feature allows two; a restart needs two   |
| A verified run leaves a `gofer-isolated-worktree-*` folder | Known cleanup gap                                                    | `git worktree remove --force <path>`                |

## Known limits

- Only Codex on macOS is qualified. Claude, Copilot, Antigravity, Grok and VS
  Code have no qualified adapter. Linux and Windows fail closed.
- The corpus is written inside this project. The reviewer is a model.
- The capability key is plaintext in your account. A worker can read it and
  could forge a capability receipt. It cannot forge a benchmark attestation.
- The verifier defence covers workers, scripts and agents. It does not cover an
  administrator.
- No CI job runs a live model. CI runs the unit tests and the release-parity
  checks. Live proof is run by hand, as above.
