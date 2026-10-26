/**
 * Validates the portable consultant toolkit: 50 Agent Skills that must load on
 * Claude and OpenAI surfaces, own one distinct output each, and hand off only
 * to skills that exist.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const validatorUrl = new URL('../../../scripts/verify-consultant-toolkit.mjs', import.meta.url);
const SKILLS_DIR = fileURLToPath(new URL('../../../consultant-toolkit/skills', import.meta.url));

interface ToolkitStats {
  skillCount: number;
  listBytes: number;
  maxDescriptionBytes: number;
  maxFileBytes: number;
}

type ValidateToolkit = (
  root?: string,
  options?: { expectedCount?: number }
) => Promise<{ errors: string[]; stats: ToolkitStats }>;

let validateToolkit: ValidateToolkit;
let TOOLKIT_LIMITS: { listBudgetBytes: number; descriptionMaxBytes: number };
let SHARED_RULES: string[];
const tempRoots: string[] = [];

beforeAll(async () => {
  const mod = await import(validatorUrl.href);
  validateToolkit = mod.validateToolkit;
  TOOLKIT_LIMITS = mod.TOOLKIT_LIMITS;
  SHARED_RULES = mod.SHARED_RULES;
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function skillFile(
  name: string,
  description: string,
  boundaries = '- Not for other work.'
): string {
  return [
    '---',
    `name: ${name}`,
    `description: "${description}"`,
    '---',
    '',
    `# ${name}`,
    '',
    '## Input',
    '',
    '- Input.',
    '',
    '## Method',
    '',
    '1. Step.',
    '',
    '## Output',
    '',
    '- Output.',
    '',
    '## Quality bar',
    '',
    '- Bar.',
    '',
    '## Boundaries',
    '',
    boundaries,
    '',
    '## Rules',
    '',
    ...SHARED_RULES,
    '',
  ].join('\n');
}

function makeToolkit(skills: Record<string, string>, catalogRows: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'consultant-toolkit-'));
  tempRoots.push(root);
  for (const [dir, content] of Object.entries(skills)) {
    fs.mkdirSync(path.join(root, 'skills', dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', dir, 'SKILL.md'), content);
  }
  const catalog = [
    '| # | Skill | Owns (one output) |',
    '|---|-------|-------------------|',
    ...catalogRows,
  ];
  fs.writeFileSync(path.join(root, 'README.md'), catalog.join('\n') + '\n');
  return root;
}

const validPair = (): Record<string, string> => ({
  'alpha-skill': skillFile(
    'alpha-skill',
    'Does alpha work. Use for alpha.',
    '- Hand off to: `beta-skill`.'
  ),
  'beta-skill': skillFile('beta-skill', 'Does beta work. Use for beta.'),
});
const validRows = ['| 1 | `alpha-skill` | Alpha output |', '| 2 | `beta-skill` | Beta output |'];

describe('consultant toolkit skills', () => {
  it('ships 50 skills that pass every portability and ownership check', async () => {
    const { errors, stats } = await validateToolkit();
    expect(errors).toEqual([]);
    expect(stats.skillCount).toBe(50);
  });

  it('parses every frontmatter as YAML with only name and description', () => {
    for (const dir of fs.readdirSync(SKILLS_DIR)) {
      const { data } = matter(fs.readFileSync(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8'));
      expect(Object.keys(data), dir).toEqual(['name', 'description']);
      expect(data.name, dir).toBe(dir);
    }
  });

  it('keeps the whole skill list inside the Codex fallback budget', async () => {
    const { stats } = await validateToolkit();
    expect(stats.listBytes).toBeLessThanOrEqual(TOOLKIT_LIMITS.listBudgetBytes);
    expect(stats.maxDescriptionBytes).toBeLessThanOrEqual(TOOLKIT_LIMITS.descriptionMaxBytes);
  });

  it('accepts a minimal valid toolkit', async () => {
    const root = makeToolkit(validPair(), validRows);
    const { errors } = await validateToolkit(root, { expectedCount: 2 });
    expect(errors).toEqual([]);
  });

  it('rejects a name that does not match its folder', async () => {
    const skills = validPair();
    skills['beta-skill'] = skillFile('beta-other', 'Does beta work. Use for beta.');
    const { errors } = await validateToolkit(makeToolkit(skills, validRows), { expectedCount: 2 });
    expect(errors.some((e) => e.includes('must match the folder name'))).toBe(true);
  });

  it('rejects long, tagged, or trigger-less descriptions', async () => {
    const skills = validPair();
    skills['beta-skill'] = skillFile('beta-skill', `Has a <tag> and no trigger ${'x'.repeat(200)}`);
    const { errors } = await validateToolkit(makeToolkit(skills, validRows), { expectedCount: 2 });
    expect(errors.some((e) => e.includes('bytes; limit is'))).toBe(true);
    expect(errors.some((e) => e.includes('angle brackets'))).toBe(true);
    expect(errors.some((e) => e.includes('"Use ..." trigger'))).toBe(true);
  });

  it('rejects extra frontmatter fields that some surfaces do not read', async () => {
    const skills = validPair();
    skills['beta-skill'] = skillFile('beta-skill', 'Does beta work. Use for beta.').replace(
      'name: beta-skill\n',
      'name: beta-skill\nallowed-tools: Bash\n'
    );
    const { errors } = await validateToolkit(makeToolkit(skills, validRows), { expectedCount: 2 });
    expect(errors.some((e) => e.includes('unsupported frontmatter line'))).toBe(true);
  });

  it('rejects hand-offs to skills that do not exist', async () => {
    const skills = validPair();
    skills['beta-skill'] = skillFile(
      'beta-skill',
      'Does beta work. Use for beta.',
      '- Use `gamma-skill`.'
    );
    const { errors } = await validateToolkit(makeToolkit(skills, validRows), { expectedCount: 2 });
    expect(errors).toContain('beta-skill: references unknown skill "gamma-skill"');
  });

  it('rejects product-specific instructions in a skill body', async () => {
    const skills = validPair();
    skills['beta-skill'] = skillFile(
      'beta-skill',
      'Does beta work. Use for beta.',
      '- Ask ChatGPT.'
    );
    const { errors } = await validateToolkit(makeToolkit(skills, validRows), { expectedCount: 2 });
    expect(errors.some((e) => e.includes('host-specific term "ChatGPT"'))).toBe(true);
  });

  it('rejects two skills that own the same output', async () => {
    const rows = ['| 1 | `alpha-skill` | Shared output |', '| 2 | `beta-skill` | Shared output |'];
    const { errors } = await validateToolkit(makeToolkit(validPair(), rows), { expectedCount: 2 });
    expect(errors).toContain('catalog: beta-skill and alpha-skill both own "Shared output"');
  });

  it('rejects a skill missing from the catalog', async () => {
    const { errors } = await validateToolkit(makeToolkit(validPair(), [validRows[0]]), {
      expectedCount: 2,
    });
    expect(errors).toContain('catalog: beta-skill is listed 0 times; expected once');
  });
});
