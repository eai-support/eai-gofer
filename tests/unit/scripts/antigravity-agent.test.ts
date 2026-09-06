import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL(
  '../../../.specify/scripts/node/lib/antigravity-agent.mjs',
  import.meta.url
);
const sourceRoot = fileURLToPath(new URL('../../../.claude/agents/', import.meta.url));
const sources = fs
  .readdirSync(sourceRoot)
  .filter((file) => file.endsWith('.md'))
  .sort();
const expectedTools: Record<string, string> = {
  Read: 'view_file',
  Grep: 'grep_search',
  Glob: 'find_by_name',
  LS: 'list_dir',
  WebSearch: 'search_web',
  WebFetch: 'read_url_content',
  Write: 'write_to_file',
};

function document(
  header = 'name: reviewer\ndescription: Reviews the change\ntools: Read, Grep, Glob, LS\nmodel: sonnet',
  body = '\n# Review\n\nKeep **all** instructions.\n'
) {
  return `---\n${header}\n---\n${body}`;
}

function parseConverted(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  expect(match).not.toBeNull();
  // The converter deliberately emits JSON values, a dependency-free YAML subset.
  return Object.fromEntries(
    match![1].split(/\r?\n/).map((line) => {
      const separator = line.indexOf(': ');
      return [line.slice(0, separator), JSON.parse(line.slice(separator + 2))];
    })
  );
}

describe('native Antigravity agent conversion', () => {
  it('covers all 42 unchanged source agents', () => {
    expect(sources).toHaveLength(42);
  });

  it.each(sources)('preserves instructions and exact permissions for %s', async (file) => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    const sourcePath = path.join(sourceRoot, file);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const header = source.split('---')[1];
    const body = source.slice(source.indexOf('\n---\n') + '\n---\n'.length);
    const sourceTools = /^tools: (.+)$/m
      .exec(header)![1]
      .split(',')
      .map((tool) => tool.trim());
    const converted = convertAntigravityAgent(source);
    const native = parseConverted(converted);
    expect(native).toEqual({
      name: /^name: (.+)$/m.exec(header)![1],
      description: /(?:^|\n)description:([^\n]*(?:\n {2}[^\n]+)*)/
        .exec(header)![1]
        .trim()
        .split(/\s*\n\s*/)
        .join(' '),
      tools: sourceTools.map((tool) => expectedTools[tool]),
      model: 'inherit',
      mainAgent: false,
      subagent: true,
      commandExecutionPolicy: 'off',
    });
    expect(converted.endsWith(body)).toBe(true);
    expect(native.tools).not.toContain('run_command');
    if (!sourceTools.includes('Write')) expect(native.tools).not.toContain('write_to_file');
    const perspective = /^perspective: (.+)$/m.exec(header)?.[1];
    if (perspective)
      expect(converted.slice(converted.indexOf('\n---\n') + 5)).toContain(
        `Perspective: ${perspective}\n`
      );
    expect(native).not.toHaveProperty('perspective');
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(source);
    expect(convertAntigravityAgent(source)).toBe(converted);
  });

  it('maps all seven supported tools without adding capabilities', async () => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    const converted = convertAntigravityAgent(
      document(
        `name: writer\ndescription: Produces a document\ntools: ${Object.keys(expectedTools).join(', ')}\nmodel: anything`
      )
    );
    expect(parseConverted(converted).tools).toEqual(Object.values(expectedTools));
    expect(parseConverted(converted).model).toBe('inherit');
  });

  it('preserves CRLF, body frontmatter examples, spacing and absent final newline', async () => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    const body = '\r\n# Review\r\n\r\n```yaml\r\n---\r\ntools: Write\r\n---\r\n```\r\n  unchanged';
    const source = document(undefined, '').replaceAll('\n', '\r\n') + body;
    const converted = convertAntigravityAgent(source);
    expect(converted.slice(converted.indexOf('\r\n---\r\n') + 7)).toBe(body);
    expect(parseConverted(converted).tools).not.toContain('write_to_file');
  });

  it('folds plain multiline descriptions and places perspective only in the body', async () => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    const body = '\n# Original body\n';
    const source = document(
      'name: writer\ndescription:\n  A plain "quoted" word and\n  another line\ntools: Write\nperspective: domain modeling',
      body
    );
    const converted = convertAntigravityAgent(source);
    expect(parseConverted(converted).description).toBe('A plain "quoted" word and another line');
    expect(converted.endsWith(`\nPerspective: domain modeling\n${body}`)).toBe(true);
  });

  it.each([
    'Bash',
    'Edit',
    'Task',
    'ReadFile',
    'read',
    'run_command',
    '*',
    '__proto__',
    'constructor',
    'Read,',
    'Read,,Grep',
    'Read, Read',
  ])('rejects an unknown or ambiguous tool list: %s', async (tools) => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    expect(() =>
      convertAntigravityAgent(document(`name: reviewer\ndescription: Reviews\ntools: ${tools}`))
    ).toThrow();
  });

  it.each([
    'permissionMode: bypassPermissions',
    'disallowedTools: Write',
    'hooks: {}',
    'mainAgent: true',
    'commandExecutionPolicy: eager',
    '__proto__: anything',
    'name: duplicate',
  ])('rejects unsupported or duplicate fields: %s', async (field) => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    expect(() =>
      convertAntigravityAgent(
        document(`name: reviewer\ndescription: Reviews\ntools: Read\n${field}`)
      )
    ).toThrow(/Unknown agent field|Duplicate agent field/);
  });

  it.each([
    'description: Reviews\ntools: Read',
    'name: reviewer\ntools: Read',
    'name: reviewer\ndescription: Reviews',
    'name: reviewer\ndescription:\ntools: Read',
    'name: reviewer\ndescription: Reviews\ntools:',
    'name: ../reviewer\ndescription: Reviews\ntools: Read',
    'name: reviewer\ndescription: &alias Reviews\ntools: Read',
    'name: reviewer\ndescription: *alias\ntools: Read',
    'name: reviewer\ndescription: !!str Reviews\ntools: Read',
    'name: reviewer\ndescription: Reviews # comment\ntools: Read',
    'name: reviewer\ndescription: |\n  Reviews\ntools: Read',
    'name: reviewer\ndescription:\n  tools: Write\ntools: Read',
    'name: reviewer\ndescription: Reviews\ntools: [Read, Write]',
    'name: reviewer\ndescription: Reviews\ntools:\n  - Read',
    'name: reviewer\ndescription: Reviews\ntools: Read\n  Write',
    'name: reviewer\ndescription: Reviews\ntools: Read\n\tmodel: opus',
  ])('rejects missing fields and unsupported YAML instead of guessing: %s', async (header) => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    expect(() => convertAntigravityAgent(document(header))).toThrow();
  });

  it.each(['', '# No frontmatter', '---\nname: reviewer', '\n' + document()])(
    'rejects malformed documents',
    async (content) => {
      const { convertAntigravityAgent } = await import(moduleUrl.href);
      expect(() => convertAntigravityAgent(content)).toThrow(/frontmatter/);
    }
  );

  it('rejects non-string input', async () => {
    const { convertAntigravityAgent } = await import(moduleUrl.href);
    expect(() => convertAntigravityAgent(null)).toThrow(TypeError);
  });
});
