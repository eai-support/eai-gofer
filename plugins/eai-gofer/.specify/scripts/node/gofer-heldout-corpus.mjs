/** Load a private, integrity-pinned benchmark corpus without copying its cases
 * into Gofer's distributable source tree. */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;
const CATEGORIES = new Set(['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive']);
const digest = value => createHash('sha256').update(value).digest('hex');

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The manifest is a private controller input. Each case references one JSON
 * input file and pins its SHA-256. The loader rejects a corpus located inside
 * the released workspace, traversal paths, duplicate identifiers, incomplete
 * category coverage, and any changed case content.
 */
export async function loadHeldOutCorpus({ corpusRoot, workspaceRoot } = {}) {
  if (!text(corpusRoot) || !text(workspaceRoot) || !path.isAbsolute(corpusRoot) || !path.isAbsolute(workspaceRoot)) {
    throw new Error('HELDOUT_CORPUS_PATH_REQUIRED');
  }
  const [root, workspace] = await Promise.all([realpath(corpusRoot), realpath(workspaceRoot)]);
  if (within(workspace, root)) throw new Error('HELDOUT_CORPUS_MUST_BE_EXTERNAL');
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length < 4 ||
      new Set(manifest.cases.map(item => item?.id)).size !== manifest.cases.length) throw new Error('INVALID_HELDOUT_MANIFEST');
  const categories = new Set();
  const cases = [];
  for (const item of manifest.cases) {
    if (!text(item?.id) || !CATEGORIES.has(item?.category) || !text(item?.inputFile) ||
        !/^[a-f0-9]{64}$/i.test(item?.inputSha256 ?? '')) throw new Error('INVALID_HELDOUT_MANIFEST');
    const inputPath = path.resolve(root, item.inputFile);
    if (!within(root, inputPath)) throw new Error('INVALID_HELDOUT_MANIFEST');
    const input = await readFile(inputPath, 'utf8');
    if (digest(input) !== item.inputSha256) throw new Error('HELDOUT_INPUT_INTEGRITY_REQUIRED');
    categories.add(item.category);
    cases.push(Object.freeze({ id: item.id, heldOut: true, category: item.category, input: JSON.parse(input) }));
  }
  if (categories.size !== CATEGORIES.size || [...CATEGORIES].some(category => !categories.has(category))) {
    throw new Error('HELDOUT_CATEGORY_COVERAGE_REQUIRED');
  }
  return Object.freeze({ schemaVersion: 1, corpusHash: digest(JSON.stringify(manifest)), cases: Object.freeze(cases) });
}
