#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseStageCommand } from '../.specify/scripts/node/parse-stage-command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

export function normalizePreservedStage(content) {
  return content
    .replace(/\r\n/g, '\n')
    // The approved host rename must not hide any stage body change.
    .replace(/^(---\n[\s\S]*?\nsurfaces:\n[\s\S]*?)  - antigravity\n/, '$1  - gemini\n')
    .replace(
      /## Token And Cost Policy\n<!-- gofer:token-cost-policy:start -->[\s\S]*?<!-- gofer:token-cost-policy:end -->/g,
      ''
    )
    .replace(
      /model="(haiku|sonnet|opus)"/g,
      (_, model) => `model_tier="${{ haiku: 'simple', sonnet: 'medium', opus: 'arbiter' }[model]}"`
    )
    .replace(
      /\| (haiku|sonnet|opus)(\s*)\|/g,
      (_, model, spaces) =>
        `| ${{ haiku: 'simple', sonnet: 'medium', opus: 'arbiter' }[model]}${spaces}|`
    )
    .trimEnd();
}

export async function verifyOrchestrationPreservation() {
  const baseline = JSON.parse(await read('tests/fixtures/portable-orchestration-baseline.json'));
  const migrations = JSON.parse(
    await read('tests/fixtures/orchestration-approved-migrations.json')
  );
  const surfaceMigration = JSON.parse(await read('tests/fixtures/antigravity-surface-migration.json'));
  if (surfaceMigration.from !== 'gemini' || surfaceMigration.to !== 'antigravity' || !surfaceMigration.reason || JSON.stringify(surfaceMigration.settingReplacement) !== JSON.stringify(['antigravity', 'antigravity-desktop'])) {
    throw new Error('Invalid surface migration');
  }
  for (const test of surfaceMigration.tests) await read(test);
  const migrateHost = (host) => host === surfaceMigration.from ? surfaceMigration.to : host;
  const failures = [];
  const check = (ok, name) => {
    if (!ok) failures.push(name);
  };
  const stages = await readdir(path.join(root, '.specify/commands'));
  for (const file of baseline.stageFiles)
    check(stages.includes(file), `Missing internal stage: ${file}`);
  for (const entry of baseline.internalCommands) {
    const { frontmatter } = await parseStageCommand(path.join(root, entry.path));
    check(
      frontmatter.name === entry.id && frontmatter.category === entry.category,
      `Stage identity changed: ${entry.path}`
    );
    check(
      JSON.stringify(frontmatter.aliases ?? []) === JSON.stringify(entry.aliases),
      `Stage aliases changed: ${entry.path}`
    );
    check(
      JSON.stringify(frontmatter.surfaces) ===
        JSON.stringify(baseline.canonicalCommandSurfaceNames.map(migrateHost)),
      `Stage surfaces changed: ${entry.path}`
    );
    const digest = createHash('sha256')
      .update(normalizePreservedStage(await read(entry.path)))
      .digest('hex');
    check(
      digest === baseline.stageContentHashes[entry.path],
      `Unapproved stage guidance change: ${entry.path}`
    );
  }
  const manifest = JSON.parse(await read('extension/package.json'));
  const commands = manifest.contributes.commands.map((command) => command.command);
  const config = [manifest.contributes.configuration]
    .flat()
    .flatMap((group) => Object.keys(group.properties));
  for (const id of baseline.vscodeCommandIds)
    check(commands.includes(id), `Missing VS Code command: ${id}`);
  for (const key of baseline.vscodeConfigurationKeys)
    check(config.includes(key), `Missing VS Code setting: ${key}`);
  const properties = Object.assign(
    {},
    ...[manifest.contributes.configuration].flat().map((group) => group.properties)
  );
  for (const [key, contract] of Object.entries(baseline.vscodeConfigurationContracts)) {
    for (const [field, value] of Object.entries(contract)) {
      check(
        JSON.stringify(properties[key]?.[field]) === JSON.stringify(
          field === 'enum' && surfaceMigration.settings.includes(key)
            ? value.flatMap(host => host === surfaceMigration.from ? surfaceMigration.settingReplacement : [host])
            : value
        ),
        `VS Code setting contract changed: ${key}.${field}`
      );
    }
  }
  for (const [file, expected] of Object.entries(baseline.preservationHashes)) {
    const actual = createHash('sha256')
      .update((await read(file)).replace(/\r\n/g, '\n'))
      .digest('hex');
    const migration = migrations[file];
    if (migration) {
      check(
        migration.previousHash === expected && Boolean(migration.reason),
        `Invalid approved migration: ${file}`
      );
      check(actual === migration.approvedHash, `Approved migration drift: ${file}`);
      for (const test of migration.tests) await read(test);
    } else {
      check(actual === expected, `Preserved contract changed; explicit review required: ${file}`);
    }
  }
  let migratedEntrypoints = 0;
  for (const file of baseline.surfaceEntrypoints) {
    const retired = file.match(/(?:\.gemini|extension\/resources\/gemini)\/commands\/gofer\/(eai(?:-update)?)\.(?:md|toml)$/);
    if (retired) {
      await read(`plugins/antigravity/eai-gofer/skills/${retired[1]}/SKILL.md`);
      migratedEntrypoints += 1;
    } else await read(file);
  }
  const activeEntrypoints = [
    '.agents/skills/eai/SKILL.md',
    '.claude/commands/eai.md',
    '.claude/skills/eai/SKILL.md',
    '.github/prompts/eai.prompt.md',
    '.github/skills/eai/SKILL.md',
    'plugins/antigravity/eai-gofer/skills/eai/SKILL.md',
    '.grok/skills/eai/SKILL.md',
    '.system/skills/eai/SKILL.md',
    'extension/resources/copilot-prompts/eai.prompt.md',
    'skills/eai/SKILL.md',
    'plugins/eai-gofer/skills/eai/SKILL.md',
    'plugins/eai-gofer/plugins/eai-gofer/skills/eai/SKILL.md',
  ];
  for (const file of activeEntrypoints) {
    const content = await read(file);
    check(content.includes('portable-orchestration.md'), `Missing portable guidance: ${file}`);
    check(content.includes('off by default'), `Missing opt-in boundary: ${file}`);
    check(
      content.includes('Discover models for this host, client, account and profile'),
      `Missing surface-scoped model discovery: ${file}`
    );
  }
  const shared = [
    '.specify/references/portable-orchestration.md',
    '.specify/scripts/node/gofer-orchestration.mjs',
    '.specify/scripts/node/lib/portable-orchestration.mjs',
    '.specify/scripts/node/lib/orchestration-contract.mjs',
    '.specify/scripts/node/gofer-model-discovery.mjs',
    '.specify/scripts/node/lib/model-discovery.mjs',
    '.specify/scripts/node/lib/model-discovery.d.mts',
  ];
  for (const file of shared) {
    const source = await read(file);
    const extension = file
      .replace('.specify/scripts/node/', 'extension/resources/node-scripts/')
      .replace('.specify/references/', 'extension/resources/references/');
    check(source === (await read(extension)), `Extension mirror drift: ${file}`);
    for (const base of ['plugins/eai-gofer', 'plugins/eai-gofer/plugins/eai-gofer']) {
      check(source === (await read(`${base}/${file}`)), `Plugin mirror drift: ${base}/${file}`);
    }
  }
  for (const base of [
    '',
    'extension/resources/node-scripts/',
    'plugins/eai-gofer/',
    'plugins/eai-gofer/plugins/eai-gofer/',
  ]) {
    const file =
      base === 'extension/resources/node-scripts/'
        ? `${base}lib/portable-orchestration.mjs`
        : `${base}.specify/scripts/node/lib/portable-orchestration.mjs`;
    const { planOrchestration } = await import(pathToFileURL(path.join(root, file)).href);
    check(planOrchestration().status === 'legacy', `Default changed: ${file}`);
    check(
      planOrchestration({ policy: { enabled: false } }).canClaimDone === false,
      `False completion: ${file}`
    );
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {
    baselineCommit: baseline.baselineCommit,
    preservedStages: baseline.stageFiles.length,
    surfaces: baseline.surfaceEntrypoints.length,
    migratedEntrypoints,
    protectedContracts: Object.keys(baseline.preservationHashes).length,
    approvedMigrations: Object.keys(migrations).length,
    liveHostExecution: 'not tested by this contract check',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyOrchestrationPreservation()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
