import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('workspace preflight surface generation', () => {
  it('injects host-specific workspace checks into generated stage surfaces', () => {
    expect(read('.claude/commands/0_gofer_start.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('extension/resources/claude-commands/0_gofer_start.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('.github/prompts/0_gofer_start.prompt.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host copilot --json'
    );
    expect(read('.agents/skills/0_gofer_start/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.system/skills/0_gofer_start/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.gemini/commands/gofer/0_gofer_start.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host gemini --json'
    );
  });

  it('does not inject workspace preflight into pure control commands', () => {
    expect(read('.claude/commands/gofer_plan.md')).not.toContain('## Workspace Preflight');
    expect(read('.agents/skills/gofer_plan/SKILL.md')).not.toContain('## Workspace Preflight');
    expect(read('.gemini/commands/gofer/gofer_plan.md')).not.toContain('## Workspace Preflight');
  });
});
