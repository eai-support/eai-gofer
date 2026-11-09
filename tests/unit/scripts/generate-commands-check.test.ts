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

  it('reuses original-failure tenant guidance in generated AGENTS and special commands', () => {
    const agents = fs.readFileSync(path.join(ROOT, '.agents/AGENTS.md'), 'utf8');
    expect(agents).toContain(
      'reuse the original-failure guidance for `app_token_tenant_context_required`'
    );
    expect(agents).toContain('only if it has not been queried');
    for (const file of ['0_gofer_start.md', '5_gofer_implement.md', 'gofer_eai_first_run.md']) {
      const content = fs
        .readFileSync(path.join(ROOT, '.specify/commands', file), 'utf8')
        .replace(/\s+/g, ' ');
      expect(content).toMatch(/reuse the original-failure guidance/i);
      expect(content).toMatch(/only if it has not been queried/i);
    }
  });

  it('keeps the capability validation contract singular after regeneration', () => {
    const command = fs.readFileSync(CANONICAL_COMMAND, 'utf8');

    expect(command.match(/^## MVP Capability-Based Validation$/gm)).toHaveLength(1);
  });
});
