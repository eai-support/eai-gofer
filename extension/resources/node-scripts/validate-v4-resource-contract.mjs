#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_URL =
  'https://docs.eai.software/services/publicapi/v4/resource-mutation-contract';
const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue',
]);
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.specify',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'tests',
  '__tests__',
]);
const RESOURCE_URL_PATTERN =
  /(?:\/api\/eai)?\/v4\/data\/resources|resourceUrl\s*\(/;
const NON_RECORD_MUTATION_PATTERN =
  /\/(?:object-types|query|search|aggregate|batch|files|links|shares|parents|storage)(?:\/|['"`}]|$)/;
const IS_DIRECT_RUN =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function callSnippets(content, calleePattern) {
  const snippets = [];
  const regex = new RegExp(`\\b(?:${calleePattern})\\s*\\(`, 'g');
  let match;

  while ((match = regex.exec(content)) !== null) {
    const openIndex = content.indexOf('(', match.index);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = openIndex; index < content.length; index += 1) {
      const character = content[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === quote) {
          quote = '';
        }
        continue;
      }
      if (character === "'" || character === '"' || character === '`') {
        quote = character;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          snippets.push({
            start: match.index,
            end: index + 1,
            text: content.slice(match.index, index + 1),
          });
          regex.lastIndex = index + 1;
          break;
        }
      }
    }
  }

  return snippets;
}

function methodOf(snippet) {
  return snippet.match(/\bmethod\s*:\s*['"`](POST|PUT|PATCH)['"`]/i)?.[1]?.toUpperCase();
}

function hasObjectEnvelope(snippet, requiredProperties) {
  const stringify = snippet.match(/JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!stringify) return false;
  const objectBody = stringify[1].trim();
  return requiredProperties.every((property) =>
    new RegExp(`\\b${property}\\s*(?::|,|$)`).test(objectBody)
  );
}

function violation(ruleId, file, content, index, message, remediation) {
  return {
    ruleId,
    file,
    line: lineNumber(content, index),
    message,
    remediation,
    documentation: DOCS_URL,
  };
}

export function validateSourceContent(content, file = '<memory>') {
  const violations = [];
  const requests = callSnippets(content, 'fetch|platformFetch');

  for (const request of requests) {
    if (!RESOURCE_URL_PATTERN.test(request.text)) continue;
    const method = methodOf(request.text);
    const isObjectTypeManagement = /\/object-types(?:\/|['"`}]|$)/.test(request.text);

    if (method === 'PATCH' && !isObjectTypeManagement) {
      violations.push(
        violation(
          'EAI_V4_RESOURCE_PATCH_FORBIDDEN',
          file,
          content,
          request.start,
          'PATCH is not a valid PublicAPI v4 resource record update.',
          'Use PUT with {"data": {...}, "version": n}.'
        )
      );
      continue;
    }

    if (method === 'PUT' && !isObjectTypeManagement) {
      if (!hasObjectEnvelope(request.text, ['data', 'version'])) {
        violations.push(
          violation(
            'EAI_V4_RESOURCE_ENVELOPE_REQUIRED',
            file,
            content,
            request.start,
            'A PublicAPI v4 resource update is not provably wrapped in data and version.',
            'Send PUT with JSON.stringify({ data, version }).'
          )
        );
      }
      continue;
    }

    if (method !== 'POST') continue;
    if (/\/actions\//.test(request.text)) {
      if (!hasObjectEnvelope(request.text, ['params'])) {
        violations.push(
          violation(
            'EAI_V4_RESOURCE_ENVELOPE_REQUIRED',
            file,
            content,
            request.start,
            'A PublicAPI v4 resource action is missing the params envelope.',
            'Send POST with JSON.stringify({ params }).'
          )
        );
      }
      continue;
    }
    if (isObjectTypeManagement || NON_RECORD_MUTATION_PATTERN.test(request.text)) {
      continue;
    }
    if (!hasObjectEnvelope(request.text, ['data'])) {
      violations.push(
        violation(
          'EAI_V4_RESOURCE_ENVELOPE_REQUIRED',
          file,
          content,
          request.start,
          'A PublicAPI v4 resource create is not provably wrapped in data.',
          'Send POST with JSON.stringify({ data }).'
        )
      );
    }
  }

  const actionCalls = callSnippets(content, '[A-Za-z_$][\\w$]*\\.executeAction');
  for (const actionCall of actionCalls) {
    const afterAction = content.slice(actionCall.end, actionCall.end + 1600);
    const updateFromIndex = afterAction.search(/\.\s*updateFrom\s*\(/);
    const updateMatch = /\.\s*update\s*\(/.exec(afterAction);
    if (!updateMatch || (updateFromIndex !== -1 && updateFromIndex < updateMatch.index)) {
      continue;
    }

    const assignmentPrefix = content.slice(
      Math.max(0, actionCall.start - 160),
      actionCall.start
    );
    const resultName = assignmentPrefix.match(
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s*$/
    )?.[1];
    const updateWindow = afterAction.slice(updateMatch.index, updateMatch.index + 800);
    const usesActionVersion =
      resultName && updateWindow.includes(`${resultName}.version`);

    if (!usesActionVersion) {
      violations.push(
        violation(
          'EAI_V4_RESOURCE_STALE_VERSION_FLOW',
          file,
          content,
          actionCall.start,
          'An action is followed by update without using the action result version.',
          'Capture executeAction(), then call updateFrom(objectType, actionResult, data) or pass actionResult.version.'
        )
      );
    }
  }

  return violations;
}

async function sourceFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(absolute);
      }
    }
  }

  await visit(root);
  return files;
}

export async function validateWorkspace(workspace) {
  const root = path.resolve(workspace);
  const files = await sourceFiles(root);
  const violations = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    violations.push(
      ...validateSourceContent(content, path.relative(root, file))
    );
  }
  return {
    valid: violations.length === 0,
    filesScanned: files.length,
    violations,
  };
}

function parseArgs(argv) {
  const args = { workspace: process.cwd(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--workspace') {
      args.workspace = argv[index + 1] || args.workspace;
      index += 1;
    } else if (argv[index] === '--json') {
      args.json = true;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      process.stdout.write(
        'Usage: validate-v4-resource-contract.mjs [--workspace <path>] [--json]\n'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateWorkspace(args.workspace);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.valid) {
    process.stdout.write(
      `PASS PublicAPI v4 resource mutation contract (${result.filesScanned} files scanned)\n`
    );
  } else {
    for (const item of result.violations) {
      process.stderr.write(
        `${item.file}:${item.line} ${item.ruleId}: ${item.message}\n` +
          `  Fix: ${item.remediation}\n  Docs: ${item.documentation}\n`
      );
    }
  }
  process.exitCode = result.valid ? 0 : 1;
}

if (IS_DIRECT_RUN) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
