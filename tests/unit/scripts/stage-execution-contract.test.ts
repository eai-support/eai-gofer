import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_COMMAND_FILES, PUBLIC_ENTRYPOINT_NAMES } from '../../helpers/goferCommandSet';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const load = (file: string) => import(new URL(`../../../${file}`, import.meta.url).href);
const bridgeCommand =
  'node .specify/scripts/node/gofer-stage-execute.mjs --input <relative request.json> --execute --output <new .specify/specs/feature/...json>';
const referencePath = '.specify/references/portable-orchestration.md';
const compact = (text: string) => text.replace(/\s+/g, ' ');

interface Stage {
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

describe('stage execution instruction integration (not native execution proof)', () => {
  let contract: string;
  let guide: string;
  let stages: Stage[];

  beforeAll(async () => {
    const { buildPortableOrchestrationContract } = await load(
      '.specify/scripts/node/lib/orchestration-contract.mjs'
    );
    const { parseStageCommand } = await load('.specify/scripts/node/parse-stage-command.mjs');
    contract = buildPortableOrchestrationContract();
    guide = compact(await read(referencePath));
    stages = [];
    for (const stem of FULL_COMMAND_FILES) {
      const filePath = path.join(root, '.specify/commands', `${stem}.md`);
      stages.push({ filePath, ...(await parseStageCommand(filePath)) });
    }
  });

  it('routes /eai to the execution bridge, not only the pure planner', () => {
    expect(contract).toContain('For `/eai`, inspect each meaningful stage (all 26; app/non-app)');
    expect(contract).toContain(`Read and follow \`${referencePath}\``);
    expect(contract).toContain(
      'node .specify/scripts/node/gofer-stage-execute.mjs --input REQUEST --execute --output NEW'
    );
    expect(guide).toContain(bridgeCommand);
    expect(contract).toContain(
      'VS Code: native `gofer_execute_stage` with `{request}`; never substitute CLI'
    );
    expect(contract).toContain('Planner is planning-only');
    expect(Buffer.byteLength(contract)).toBeLessThan(800);
    expect(guide).toContain(
      'controller must call the execution bridge for approved, useful delegation'
    );
  });

  it('lets Copilot use enabled tools and exposes native discovery before execution', async () => {
    for (const file of [
      '.github/prompts/eai.prompt.md',
      'extension/resources/copilot-prompts/eai.prompt.md',
    ]) {
      const content = await read(file);
      const header = content.split('---')[1];
      expect(header).not.toMatch(/^tools:/m);
      expect(content).toContain('gofer_discover_models');
      expect(content).toContain('Do not search old logs or substitute CLI discovery');
    }
    const manifest = JSON.parse(await read('extension/package.json'));
    const tools = manifest.contributes.languageModelTools;
    expect(tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['gofer_discover_models', 'gofer_execute_stage'])
    );
    expect(
      tools.find((t: { name: string }) => t.name === 'gofer_discover_models').inputSchema
    ).toEqual({ type: 'object', properties: {}, additionalProperties: false });
  });

  it('keeps ordinary work native and reuses approved task limits without weakening approvals', () => {
    expect(compact(contract)).toContain(
      'Ordinary chat/no useful delegation: stay native, no discovery/inference'
    );
    expect(contract).toContain('Approved delegation runs automatically');
    expect(contract).toContain('Preserve explicit disable');
    expect(contract).toContain('Preserve explicit disable, task model/budget and approvals');
    expect(guide).toContain('Preserve explicit disable');
    expect(guide).toContain('Reuse the approved task model, route and remaining budget');
    expect(guide).toContain('do not ask for a fresh model/budget approval at every stage');
    expect(guide).toContain('does not reset time, attempt or cost limits');
    expect(guide).toContain(
      'All mandatory business-specification, security, paid-use, deployment and destructive-action approvals remain in force'
    );
  });

  it('requires native account discovery and reports selector and host limits', () => {
    expect(contract).toContain(
      'Discover models for this host, client, account and profile before execution'
    );
    expect(guide).toContain('The bridge calls native current-account discovery before executing');
    expect(guide).toContain('Do not invent worker IDs, model rankings or default ranks');
    expect(guide).toContain('Never substitute CLI for VS Code');
    expect(guide).toContain('Antigravity hard read-only execution is currently unproved');
    expect(guide).toContain(
      'legacy behavior until the adapter supports and verifies that boundary'
    );
    expect(guide).toContain('Do not report a false pass or invent read-only flags');
  });

  it('documents the installed help request shape and bounds without running inference', () => {
    const help = execFileSync(
      process.execPath,
      [path.join(root, '.specify/scripts/node/gofer-stage-execute.mjs'), '--help'],
      { cwd: root, encoding: 'utf8' }
    );
    const example = JSON.parse(help.split('Request JSON:\n')[1].split('\n\nHosts:')[0]);
    expect(Object.keys(example).sort()).toEqual([
      'context',
      'host',
      'policy',
      'stage',
      'surface',
      'task',
      'trigger',
      'workType',
    ]);
    for (const field of Object.keys(example)) {
      if (field !== 'policy') expect(guide).toContain(`| \`${field}\` |`);
    }
    expect(Object.keys(example.context).sort()).toEqual([
      'acceptance',
      'language',
      'permissions',
      'platform',
      'spec',
    ]);
    for (const field of Object.keys(example.context)) expect(guide).toContain(`\`${field}\``);
    for (const field of Object.keys(example.policy)) expect(guide).toContain(`\`policy.${field}\``);
    for (const value of [
      'cli',
      'vscode-extension',
      'app',
      'non-app',
      'ordinary',
      'delegate',
      'review',
      'failure',
      'single',
      'cascade',
      'critique',
      'peer-review',
    ]) {
      expect(guide).toContain(`\`${value}\``);
    }
    expect(guide).toContain('gofer-stage-execute.mjs --help');
    expect(guide).toContain('1-8 repository-relative text files');
    expect(guide).toContain('Combined content is at most 64 KiB');
    expect(guide).toContain('Each delegate output is limited to 64 KiB');
    expect(guide).toContain('curated feature `context-bundle.md`');
    expect(guide).toContain('`maxAttempts: 3`');
    expect(guide).toContain('`hard_cost_limit_unavailable`');
    expect(guide).toContain('never remove it to force execution');
    expect(guide).toContain('do not pass the frontmatter alias');
  });

  it('requires hash read-back and controller-owned application and delivery checks', () => {
    expect(contract).toContain('Read-only proposals');
    expect(contract).toContain(
      'controller applies authorized changes and runs all original checks'
    );
    expect(guide).toContain(
      'Before applying a proposal, recheck every returned `inputFiles` entry'
    );
    expect(guide).toContain('`{ref, sha256}`');
    expect(guide).toContain('including the canonical stage contract');
    expect(guide).toContain('hash mismatch invalidate the proposal');
    expect(guide).toContain('`canClaimDone: false`');
    expect(guide).toContain(
      'all original tests, quality gates, UI previews, diagrams, documentation and stakeholder outputs'
    );
    expect(guide).toContain('Request JSON cannot authorize shell checks');
  });

  it('prevents recursion and never trades different-family critique for peer review', () => {
    expect(contract).toContain('`GOFER_STAGE_DELEGATE=1`: no recursive dispatch');
    expect(guide).toContain('The delegate prompt must also say:');
    expect(guide).toContain(
      'Do not invoke /eai, gofer-stage-execute.mjs, gofer_execute_stage, or dispatch nested delegates'
    );
    expect(guide).toContain('prompt guard also applies to native VS Code delegates');
    expect(guide).toContain(
      'must NEVER replace an existing different-family `critique` requirement'
    );
    expect(guide).toContain('Keep all six validation roles');
    expect(guide).toContain('Never add an extra nested wrapper around a native compound workflow');
  });

  it('keeps all stages for non-app and capability-scoped app work', () => {
    expect(guide).toContain('all 26 canonical stages/helpers for both `app` and `non-app`');
    expect(guide).toContain('Keep helpers optional and session controls non-advancing');
    expect(guide).toContain('No stage is skipped or made mandatory by routing');
    expect(guide).toContain('Reuse earlier confirmed non-app classification');
    expect(guide).toContain('Skip tenant/app setup, not stages');
    expect(guide).toContain(
      'do not run `eai whoami`, tenant selection, `eai init`, or first-run setup for confirmed non-app work'
    );
    expect(guide).toContain(
      'keep all gates capability-scoped to implemented or currently required capabilities'
    );
  });

  it.each(['claude', 'codex', 'copilot', 'portable', 'grok'])(
    'renders the bridge and every internal stage into the public %s skill in memory',
    async (host) => {
      // Only call the pure formatter. Do not invoke generator main or any emitter.
      const { buildPublicEntrypointSkill } = await load(
        '.specify/scripts/node/generate-commands.mjs'
      );
      const entry = { name: 'eai', title: 'Eai', description: 'Start or continue EAI delivery.' };
      const skill = buildPublicEntrypointSkill(entry, 'test', stages, host, host);
      expect(skill).toContain(contract);
      expect(skill).toContain(
        'node .specify/scripts/node/gofer-stage-execute.mjs --input REQUEST --execute --output NEW'
      );
      expect(skill).toContain('gofer_execute_stage');
      expect(skill).toContain('expose `eai` only');
      expect(skill).toContain('internal stage contracts, not user-facing commands');
      for (const stem of FULL_COMMAND_FILES) expect(skill).toContain(`- \`${stem}\` - `);
      const update = buildPublicEntrypointSkill(
        { ...entry, name: 'eai-update' },
        'test',
        stages,
        host,
        host
      );
      expect(update).not.toContain('gofer-stage-execute.mjs');
      expect(update).not.toContain('## Internal Function Contracts');
    }
  );

  it('retains the full frozen stage inventory', async () => {
    const baseline = JSON.parse(await read('tests/fixtures/portable-orchestration-baseline.json'));
    const files = (await readdir(path.join(root, '.specify/commands')))
      .filter((file) => file.endsWith('.md'))
      .sort();
    expect(files).toHaveLength(26);
    expect(files).toEqual([...baseline.stageFiles].sort());
    expect(files).toEqual(FULL_COMMAND_FILES.map((stem) => `${stem}.md`).sort());
  });

  it.each(FULL_COMMAND_FILES)(
    'preserves %s identity, aliases and all original stage semantics',
    async (stem) => {
      const baseline = JSON.parse(
        await read('tests/fixtures/portable-orchestration-baseline.json')
      );
      const { normalizePreservedStage } = await load(
        'scripts/verify-orchestration-preservation.mjs'
      );
      const file = `.specify/commands/${stem}.md`;
      const source = await read(file);
      const expected = baseline.internalCommands.find(
        (entry: { path: string }) => entry.path === file
      );
      const stage = stages.find((entry) => entry.filePath === path.join(root, file))!;
      expect(stage.frontmatter.name).toBe(expected.id);
      expect(stage.frontmatter.category).toBe(expected.category);
      expect(stage.frontmatter.aliases ?? []).toEqual(expected.aliases);
      expect(createHash('sha256').update(normalizePreservedStage(source)).digest('hex')).toBe(
        baseline.stageContentHashes[file]
      );
      expect(source).not.toContain('The optional helper is off by default. Its cascade route');
      const policy = source.match(
        /<!-- gofer:token-cost-policy:start -->[\s\S]*?<!-- gofer:token-cost-policy:end -->/
      )?.[0];
      expect(policy).toBeTruthy();
      expect(policy).toContain('At each meaningful stage, inspect the approved task route');
      expect(policy).toContain('Stage Execution Bridge');
      expect(policy).toContain('gofer-stage-execute.mjs');
      expect(policy).toContain('native `gofer_execute_stage` with `{request}`');
      expect(policy).toContain('`GOFER_STAGE_DELEGATE=1` forbids recursive dispatch');
      expect(policy).toContain(
        'same-family peer-review never replaces required different-family critique'
      );
      expect(policy).toContain('repo-owned tier preferences, not proof of model access');
      expect(policy).not.toMatch(/Claude: Haiku|GPT-5\.3-Codex|Gemini: Flash-Lite/);
    }
  );

  it.each(['.agents/skills', '.system/skills', '.grok/skills', 'plugins/eai-gofer/skills'])(
    'keeps the existing public picker inventory in %s',
    async (directory) => {
      const entries = (await readdir(path.join(root, directory))).filter(
        (entry) => !entry.startsWith('.') && entry !== 'gofer-documentation'
      );
      expect(entries.sort()).toEqual([...PUBLIC_ENTRYPOINT_NAMES]);
    }
  );

  it('separates contract, native execution and automatic pipeline evidence', async () => {
    const rubric = compact(await read('docs/portable-orchestration-rubric.md'));
    for (const evidence of ['native execution validation', 'automatic pipeline validation']) {
      expect(guide).toContain(evidence);
      expect(rubric).toContain(evidence);
    }
    expect(rubric).toContain(
      'A direct bridge invocation does not show `/eai` automatically uses it'
    );
    expect(rubric).toContain('does not invoke generator entrypoints or write generated artifacts');
    expect(rubric).toContain('all 26 stages/helpers');
    expect(rubric).toContain('`inputFiles` entry (`{ref, sha256}`)');
    expect(rubric).toContain('`hard_cost_limit_unavailable`');
    expect(guide).toContain('Missing or unsupported surface evidence stays unverified');
  });
});
