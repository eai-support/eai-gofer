import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtimeFiles = [
  'dist/extension.js',
  'resources/node-scripts/lib/stage-execution.mjs',
  'resources/node-scripts/lib/portable-orchestration.mjs',
  'resources/copilot-prompts/eai.prompt.md',
  'resources/github-skills/eai/SKILL.md',
  'resources/references/portable-orchestration.md',
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Reader injection keeps failure cases testable without installing an extension.
export function verifyStagePackage(read, expected) {
  const manifest = JSON.parse(read('package.json').toString());
  if (manifest.version !== expected.manifest.version || manifest.publisher !== expected.manifest.publisher ||
      manifest.name !== expected.manifest.name) throw new Error('Package identity does not match the candidate.');
  for (const name of ['gofer_discover_models', 'gofer_execute_stage']) {
    const tool = manifest.contributes?.languageModelTools?.find(t => t.name === name);
    const source = expected.manifest.contributes?.languageModelTools?.find(t => t.name === name);
    if (!tool || !source || JSON.stringify(tool) !== JSON.stringify(source)) {
      throw new Error(`Missing or stale native tool: ${name}`);
    }
  }
  const hashes = {};
  for (const file of runtimeFiles) {
    const bytes = read(file);
    if (!bytes.length || digest(bytes) !== digest(expected.files[file])) throw new Error(`Missing or stale runtime: ${file}`);
    hashes[file] = digest(bytes);
  }
  const bundle = read('dist/extension.js').toString();
  for (const name of ['gofer_discover_models', 'gofer_execute_stage']) {
    if (!bundle.includes(name)) throw new Error(`Native tool missing from compiled code: ${name}`);
  }
  const prompt = read('resources/copilot-prompts/eai.prompt.md').toString();
  if (/^tools:/m.test(prompt.split('---')[1] || '') || !prompt.includes('gofer_discover_models')) {
    throw new Error('Copilot prompt does not expose native discovery through enabled tools.');
  }
  return { status: 'PASS', version: manifest.version, hashes, provesActivation: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, location, ...extra] = process.argv.slice(2);
    if (!['--vsix', '--installed'].includes(mode) || !location || extra.length) {
      throw new Error('Usage: node scripts/verify-vscode-stage-package.mjs --vsix FILE | --installed DIRECTORY');
    }
    const expected = {
      manifest: JSON.parse(readFileSync(path.join(root, 'extension/package.json'), 'utf8')),
      files: Object.fromEntries(runtimeFiles.map(file => [file, readFileSync(path.join(root, 'extension', file))])),
    };
    const target = path.resolve(location);
    const read = mode === '--installed' ? file => readFileSync(path.join(target, file)) :
      file => execFileSync('unzip', ['-p', target, `extension/${file}`], { maxBuffer: 16 * 1024 * 1024 });
    console.log(JSON.stringify(verifyStagePackage(read, expected), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
