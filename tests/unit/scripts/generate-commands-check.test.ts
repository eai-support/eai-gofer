import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, '.specify/scripts/node/generate-commands.mjs');
const CANONICAL_COMMAND = path.join(ROOT, '.specify/commands/0_gofer_start.md');

describe('generate-commands check mode', () => {
  it('validates generated inputs without rewriting canonical command sources', () => {
    const before = fs.readFileSync(CANONICAL_COMMAND, 'utf8');

    execFileSync(process.execPath, [SCRIPT, '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(fs.readFileSync(CANONICAL_COMMAND, 'utf8')).toBe(before);
  });

  it('keeps the capability validation contract singular after regeneration', () => {
    const command = fs.readFileSync(CANONICAL_COMMAND, 'utf8');

    expect(command.match(/^## MVP Capability-Based Validation$/gm)).toHaveLength(1);
  });

  it.each(['7_gofer_save', '8_gofer_branding', '10_gofer_cloud'])(
    'preserves the original final byte of %s through repeated normalization',
    async (stage) => {
      const moduleUrl = new URL(
        '../../../.specify/scripts/node/generate-commands.mjs',
        import.meta.url
      );
      const { normalizeCanonicalCommandSource } = await import(moduleUrl.href);
      const source = fs.readFileSync(path.join(ROOT, '.specify/commands', `${stage}.md`), 'utf8');
      expect(source.endsWith('\n')).toBe(false);
      const normalized = normalizeCanonicalCommandSource(source);
      expect(normalized).toBe(source);
      expect(normalizeCanonicalCommandSource(normalized)).toBe(source);
    }
  );
});
