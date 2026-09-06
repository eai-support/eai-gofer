const TOOL_NAMES = Object.freeze({
  Read: 'view_file',
  Grep: 'grep_search',
  Glob: 'find_by_name',
  LS: 'list_dir',
  WebSearch: 'search_web',
  WebFetch: 'read_url_content',
  Write: 'write_to_file',
});
const SOURCE_FIELDS = new Set(['name', 'description', 'tools', 'model', 'perspective']);

function plainScalar(value, field) {
  // This converter accepts the source format, not arbitrary YAML tags or structures.
  if (!value || /^[!&*{[\]|>@'"`#%]/.test(value) || /^[-?:](?:\s|$)/.test(value)
    || /:\s|(?:^|\s)#|[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Unsupported plain scalar for agent field: ${field}`);
  }
  return value;
}

/** Convert only Gofer's known Claude frontmatter; never infer extra permissions. */
export function convertAntigravityAgent(content) {
  if (typeof content !== 'string') throw new TypeError('Agent content must be a string.');
  const match = /^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error('Expected agent YAML frontmatter at the start of the document.');
  const [, newline, header] = match;
  const fields = Object.create(null);
  let previous;
  for (const line of header.split(/\r?\n/)) {
    if (/^ {2}\S/.test(line)) {
      if (previous !== 'description') throw new Error('Only agent description may span lines.');
      const continuation = plainScalar(line.slice(2).trimEnd(), 'description');
      fields.description = fields.description ? `${fields.description} ${continuation}` : continuation;
      continue;
    }
    const entry = /^([A-Za-z_][A-Za-z0-9_]*): *(.*)$/.exec(line);
    if (!entry) throw new Error('Unsupported agent frontmatter syntax.');
    const [, key, raw] = entry;
    if (!SOURCE_FIELDS.has(key)) throw new Error(`Unknown agent field: ${key}`);
    if (Object.hasOwn(fields, key)) throw new Error(`Duplicate agent field: ${key}`);
    const value = raw.trimEnd();
    fields[key] = key === 'description' && value === '' ? '' : plainScalar(value, key);
    previous = key;
  }
  for (const key of ['name', 'description', 'tools']) {
    if (!fields[key]) throw new Error(`Missing required agent field: ${key}`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(fields.name)) throw new Error('Invalid agent name.');
  const sourceTools = fields.tools.split(',').map((tool) => tool.trim());
  const tools = sourceTools.map((tool) => {
    if (!Object.hasOwn(TOOL_NAMES, tool)) throw new Error(`Unknown agent tool: ${tool || '(empty)'}`);
    return TOOL_NAMES[tool];
  });
  if (new Set(tools).size !== tools.length) throw new Error('Duplicate agent tool.');
  const native = {
    name: fields.name,
    description: fields.description,
    tools,
    model: 'inherit',
    mainAgent: false,
    subagent: true,
    commandExecutionPolicy: 'off',
  };
  // JSON values are valid YAML and keep "off" a string under YAML 1.1 as well.
  const convertedHeader = Object.entries(native).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(newline);
  const perspective = fields.perspective ? `${newline}Perspective: ${fields.perspective}${newline}` : '';
  return `---${newline}${convertedHeader}${newline}---${newline}${perspective}${content.slice(match[0].length)}`;
}
