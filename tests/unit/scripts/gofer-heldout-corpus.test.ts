import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHeldOutCorpus } from '../../../.specify/scripts/node/gofer-heldout-corpus.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const categories = ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'];

describe('held-out benchmark corpus', () => {
  it('loads four integrity-pinned categories only from outside the released workspace', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'gofer-workspace-'));
    const corpus = await mkdtemp(path.join(tmpdir(), 'gofer-heldout-'));
    try {
      const cases = await Promise.all(
        categories.map(async (category, index) => {
          const inputFile = `${index}.json`;
          const input = JSON.stringify({ hiddenTask: category });
          await writeFile(path.join(corpus, inputFile), input);
          return { id: `EAI-${index + 1}`, category, inputFile, inputSha256: hash(input) };
        })
      );
      await writeFile(
        path.join(corpus, 'manifest.json'),
        JSON.stringify({ schemaVersion: 1, cases })
      );
      await expect(
        loadHeldOutCorpus({ corpusRoot: corpus, workspaceRoot: workspace })
      ).resolves.toMatchObject({
        cases: expect.arrayContaining([
          expect.objectContaining({ heldOut: true, category: 'security-sensitive' }),
        ]),
      });
      await expect(
        loadHeldOutCorpus({ corpusRoot: workspace, workspaceRoot: workspace })
      ).rejects.toThrow('HELDOUT_CORPUS_MUST_BE_EXTERNAL');
      await writeFile(path.join(corpus, '0.json'), '{"changed":true}');
      await expect(
        loadHeldOutCorpus({ corpusRoot: corpus, workspaceRoot: workspace })
      ).rejects.toThrow('HELDOUT_INPUT_INTEGRITY_REQUIRED');
    } finally {
      await Promise.all([
        rm(workspace, { recursive: true, force: true }),
        rm(corpus, { recursive: true, force: true }),
      ]);
    }
  });

  it('rejects a corpus entry that links to an external file even when its hash matches', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'gofer-workspace-'));
    const corpus = await mkdtemp(path.join(tmpdir(), 'gofer-heldout-'));
    const external = await mkdtemp(path.join(tmpdir(), 'gofer-external-'));
    try {
      const cases = [];
      for (const [index, category] of categories.entries()) {
        const inputFile = `${index}.json`;
        const input = JSON.stringify({ hiddenTask: category });
        if (index === 0) {
          const externalFile = path.join(external, inputFile);
          await writeFile(externalFile, input);
          await symlink(externalFile, path.join(corpus, inputFile));
        } else {
          await writeFile(path.join(corpus, inputFile), input);
        }
        cases.push({ id: `EAI-${index + 1}`, category, inputFile, inputSha256: hash(input) });
      }
      await writeFile(
        path.join(corpus, 'manifest.json'),
        JSON.stringify({ schemaVersion: 1, cases })
      );
      await expect(
        loadHeldOutCorpus({ corpusRoot: corpus, workspaceRoot: workspace })
      ).rejects.toThrow('INVALID_HELDOUT_MANIFEST');
    } finally {
      await Promise.all(
        [workspace, corpus, external].map((directory) =>
          rm(directory, { recursive: true, force: true })
        )
      );
    }
  });
});
