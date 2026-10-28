#!/usr/bin/env node

// Validates the consultant toolkit skills against the open Agent Skills format
// and the stricter limits shared by Claude and OpenAI surfaces. It also checks
// that every skill owns one distinct output, only hands off to real skills, and
// stays a business consulting skill rather than a software delivery skill.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultToolkitRoot = path.resolve(
  path.dirname(scriptPath),
  '..',
  '.specify',
  'references',
  'consulting'
);
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === scriptPath : false;

export const TOOLKIT_LIMITS = {
  skillCount: 64,
  nameMaxChars: 64,
  // Codex shortens or drops skills when the startup list exceeds its budget
  // (8,000 characters when the context window is unknown).
  descriptionMaxBytes: 160,
  listBudgetBytes: 8000,
  // Codex inlines a skill in full only when SKILL.md stays small.
  skillFileMaxBytes: 4096,
};

// Each install set must fit the list budget on its own. Sets group catalog
// phases; a catalog without phase headings is one set.
export const INSTALL_SETS = [
  { name: 'core', phases: [1, 2, 3, 4, 5, 6, 7] },
  { name: 'ai-value', phases: [8] },
];

export const REQUIRED_SECTIONS = [
  '## Input',
  '## Method',
  '## Output',
  '## Quality bar',
  '## Boundaries',
  '## Rules',
];

export const SHARED_RULES = [
  '- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.',
  '- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].',
];

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_NAME_WORDS = /claude|anthropic|openai/;
const NON_ASCII = /[^\t\n\r\x20-\x7e]/;
const HOST_SPECIFIC_TERMS =
  /\b(Claude|Anthropic|OpenAI|ChatGPT|Codex|Copilot|GPT-\d)\b|\$ARGUMENTS|allowed-tools/;
// Software delivery vocabulary marks an app development skill, not a consulting one.
const SOFTWARE_DELIVERY_TERMS =
  /\b(sprints?|backlogs?|user stor(?:y|ies)|epics?|jira|tickets?|deploy(?:s|ed|ment)?|repositor(?:y|ies)|pull requests?|codebases?|bugs?|devops|ci\/cd|code reviews?|unit tests?)\b/i;
const SKILL_REFERENCE = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;
const CATALOG_ROW = /^\|\s*(\d+)\s*\|\s*`([a-z0-9-]+)`\s*\|\s*([^|]+?)\s*\|/;
const CATALOG_PHASE = /^###\s+(\d+)\./;

/**
 * Splits a SKILL.md file into its two allowed frontmatter fields and body.
 * Only `name` and a double-quoted `description` are allowed, because they are
 * the fields every Claude and OpenAI surface reads.
 * @param {string} content
 * @returns {{ name?: string, description?: string, body: string, errors: string[] }}
 */
export function parseSkillFile(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { body: content, errors: ['missing YAML frontmatter'] };

  const errors = [];
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^(name|description): (.*)$/);
    if (!field) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }
    fields[field[1]] = field[2];
  }

  const quoted = fields.description?.match(/^"([^"]*)"$/);
  if (fields.description !== undefined && !quoted) {
    errors.push('description must be one double-quoted line without inner quotes');
  }

  return {
    name: fields.name,
    description: quoted ? quoted[1] : fields.description,
    body: match[2],
    errors,
  };
}

/**
 * @param {string} readme
 * @returns {Array<{ number: number, name: string, owns: string, phase?: number }>}
 */
export function parseCatalog(readme) {
  const rows = [];
  let phase;
  for (const line of readme.split('\n')) {
    const heading = line.match(CATALOG_PHASE);
    if (heading) phase = Number(heading[1]);
    const row = line.match(CATALOG_ROW);
    if (row) rows.push({ number: Number(row[1]), name: row[2], owns: row[3], phase });
  }
  return rows;
}

/**
 * Names the install set for a catalog phase. Skills without a phase form one set.
 * @param {number | undefined} phase
 * @returns {string}
 */
export function installSetFor(phase) {
  if (phase === undefined) return 'all';
  return INSTALL_SETS.find((set) => set.phases.includes(phase))?.name ?? `phase-${phase}`;
}

function checkSkill(dirName, content, knownNames) {
  const errors = [];
  const fail = (message) => errors.push(`${dirName}: ${message}`);
  const { name, description, body, errors: parseErrors } = parseSkillFile(content);
  parseErrors.forEach(fail);

  const fileBytes = Buffer.byteLength(content, 'utf8');
  if (fileBytes > TOOLKIT_LIMITS.skillFileMaxBytes) {
    fail(`SKILL.md is ${fileBytes} bytes; limit is ${TOOLKIT_LIMITS.skillFileMaxBytes}`);
  }
  if (NON_ASCII.test(content)) fail('use ASCII only, so byte and character limits agree');

  if (name !== dirName) fail(`name "${name}" must match the folder name`);
  if (name && !NAME_PATTERN.test(name))
    fail('name must be lowercase words joined by single hyphens');
  if (name && name.length > TOOLKIT_LIMITS.nameMaxChars) fail('name is too long');
  if (name && RESERVED_NAME_WORDS.test(name)) fail('name uses a reserved vendor word');

  const descriptionBytes = Buffer.byteLength(description ?? '', 'utf8');
  if (!description) {
    fail('description is missing');
  } else {
    if (descriptionBytes > TOOLKIT_LIMITS.descriptionMaxBytes) {
      fail(
        `description is ${descriptionBytes} bytes; limit is ${TOOLKIT_LIMITS.descriptionMaxBytes}`
      );
    }
    if (/[<>]/.test(description)) fail('description must not contain angle brackets');
    if (!/\. Use /.test(description)) fail('description must end with a "Use ..." trigger');
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(`\n${section}\n`)) fail(`missing section "${section}"`);
  }
  for (const rule of SHARED_RULES) {
    if (!body.includes(rule)) fail('missing a shared rule line');
  }

  const hostTerm = body.match(HOST_SPECIFIC_TERMS);
  if (hostTerm) fail(`host-specific term "${hostTerm[0]}" breaks portability`);

  const deliveryTerm = content.match(SOFTWARE_DELIVERY_TERMS);
  if (deliveryTerm)
    fail(
      `software delivery term "${deliveryTerm[0]}"; keep skills in business consulting language`
    );

  for (const [, reference] of body.matchAll(SKILL_REFERENCE)) {
    if (reference === dirName) fail('references itself');
    else if (!knownNames.has(reference)) fail(`references unknown skill "${reference}"`);
  }

  return {
    errors,
    listBytes: Buffer.byteLength(dirName, 'utf8') + descriptionBytes,
    descriptionBytes,
    fileBytes,
  };
}

function checkCatalog(readme, skillNames) {
  const errors = [];
  const rows = parseCatalog(readme);
  const seenNames = new Map();
  const seenOwns = new Map();

  rows.forEach((row, index) => {
    if (row.number !== index + 1)
      errors.push(`catalog: row ${row.name} is numbered ${row.number}, expected ${index + 1}`);
    seenNames.set(row.name, (seenNames.get(row.name) ?? 0) + 1);
    const owns = row.owns.toLowerCase();
    if (seenOwns.has(owns)) {
      errors.push(`catalog: ${row.name} and ${seenOwns.get(owns)} both own "${row.owns}"`);
    } else {
      seenOwns.set(owns, row.name);
    }
  });

  for (const name of skillNames) {
    const count = seenNames.get(name) ?? 0;
    if (count !== 1) errors.push(`catalog: ${name} is listed ${count} times; expected once`);
  }
  for (const name of seenNames.keys()) {
    if (!skillNames.includes(name)) errors.push(`catalog: ${name} has no skill folder`);
  }
  return errors;
}

async function listNames(dir, toName) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).map(toName).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Counts how many stage-map rows name each skill in their method column.
 * @param {string} routing
 * @returns {Map<string, number>}
 */
export function countStageAssignments(routing) {
  const counts = new Map();
  const section = routing.split(/^## Stage Map$/m)[1]?.split(/^## /m)[0] ?? '';
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const method = cells[2];
    if (!line.startsWith('|') || !method || /^-+$/.test(method) || method === 'Consulting method')
      continue;
    for (const [, name] of method.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Checks that the Gofer routing reference only names real owners: consulting
 * skills, Gofer specialist agents and skills (kebab-case), and Gofer commands
 * (snake-case stems in .specify/commands).
 * @param {string} routing
 * @param {string} toolkitRoot
 * @param {string[]} skillNames
 */
async function checkRouting(routing, toolkitRoot, skillNames) {
  const specifyRoot = path.resolve(toolkitRoot, '..', '..');
  const repoRoot = path.resolve(specifyRoot, '..');
  const commands = new Set(
    await listNames(path.join(specifyRoot, 'commands'), (e) =>
      e.isFile() && e.name.endsWith('.md') ? e.name.slice(0, -3) : null
    )
  );
  const kebabOwners = new Set([
    ...skillNames,
    ...(await listNames(path.join(repoRoot, '.claude', 'agents'), (e) =>
      e.isFile() && e.name.endsWith('.md') ? e.name.slice(0, -3) : null
    )),
    ...(await listNames(path.join(specifyRoot, 'skills'), (e) =>
      e.isDirectory() ? e.name : null
    )),
  ]);

  const errors = [];
  for (const [, token] of routing.matchAll(/`([a-z0-9]+(?:[-_][a-z0-9]+)+)`/g)) {
    const known = token.includes('_') ? commands.has(token) : kebabOwners.has(token);
    if (!known)
      errors.push(`routing: "${token}" is not a consulting skill, Gofer command, or Gofer agent`);
  }
  const stageCounts = countStageAssignments(routing);
  for (const name of skillNames) {
    const count = stageCounts.get(name) ?? 0;
    if (count !== 1)
      errors.push(`routing: ${name} has ${count} stages in the stage map; expected 1`);
  }
  return errors;
}

/**
 * @param {string} [toolkitRoot]
 * @param {{ expectedCount?: number, requireRouting?: boolean }} [options]
 */
export async function validateToolkit(toolkitRoot = defaultToolkitRoot, options = {}) {
  const expectedCount = options.expectedCount ?? TOOLKIT_LIMITS.skillCount;
  const skillsDir = path.join(toolkitRoot, 'skills');
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skillNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const knownNames = new Set(skillNames);
  const errors = [];

  if (skillNames.length !== expectedCount) {
    errors.push(`expected ${expectedCount} skills, found ${skillNames.length}`);
  }

  const stats = {
    skillCount: skillNames.length,
    listBytes: 0,
    setBytes: {},
    maxDescriptionBytes: 0,
    maxFileBytes: 0,
  };
  const skillListBytes = new Map();
  for (const name of skillNames) {
    let content;
    try {
      content = await fs.readFile(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    } catch {
      errors.push(`${name}: missing SKILL.md`);
      continue;
    }
    const result = checkSkill(name, content, knownNames);
    errors.push(...result.errors);
    stats.listBytes += result.listBytes;
    skillListBytes.set(name, result.listBytes);
    stats.maxDescriptionBytes = Math.max(stats.maxDescriptionBytes, result.descriptionBytes);
    stats.maxFileBytes = Math.max(stats.maxFileBytes, result.fileBytes);
  }

  let catalog = [];
  try {
    const readme = await fs.readFile(path.join(toolkitRoot, 'README.md'), 'utf8');
    errors.push(...checkCatalog(readme, skillNames));
    catalog = parseCatalog(readme);
  } catch {
    errors.push('missing README.md catalog');
  }

  const phaseOf = new Map(catalog.map((row) => [row.name, row.phase]));
  for (const [name, bytes] of skillListBytes) {
    const set = installSetFor(phaseOf.get(name));
    stats.setBytes[set] = (stats.setBytes[set] ?? 0) + bytes;
  }
  for (const [set, bytes] of Object.entries(stats.setBytes)) {
    if (bytes > TOOLKIT_LIMITS.listBudgetBytes) {
      errors.push(
        `install set ${set}: names and descriptions total ${bytes} bytes; budget is ${TOOLKIT_LIMITS.listBudgetBytes}`
      );
    }
  }

  // Routing applies only when the pack ships inside Gofer.
  try {
    const routing = await fs.readFile(path.join(toolkitRoot, 'routing.md'), 'utf8');
    errors.push(...(await checkRouting(routing, toolkitRoot, skillNames)));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (options.requireRouting ?? toolkitRoot === defaultToolkitRoot) {
      errors.push('missing routing.md for Gofer');
    }
  }

  return { errors, stats };
}

if (isDirectRun) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : defaultToolkitRoot;
  const { errors, stats } = await validateToolkit(root);
  const sets = Object.entries(stats.setBytes)
    .map(([set, bytes]) => `${set} ${bytes}/${TOOLKIT_LIMITS.listBudgetBytes}`)
    .join(', ');
  console.log(
    `consultant-toolkit: ${stats.skillCount} skills, list bytes by install set: ${sets}, ` +
      `longest description ${stats.maxDescriptionBytes} bytes, largest SKILL.md ${stats.maxFileBytes} bytes`
  );
  if (errors.length > 0) {
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('consultant-toolkit: all checks passed');
}
