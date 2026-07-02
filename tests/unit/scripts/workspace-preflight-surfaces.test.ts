import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readPublicPlugin(relativePath: string): string {
  return read(path.join('docs-site', 'static', 'releases', 'plugins', 'eai-gofer', relativePath));
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

  it('keeps the checked-in public plugin bundle aligned with current command surfaces', () => {
    const publicPluginRoot = path.join(
      REPO_ROOT,
      'docs-site',
      'static',
      'releases',
      'plugins',
      'eai-gofer'
    );

    expect(fs.existsSync(path.join(publicPluginRoot, 'commands', '0_gofer_start.md'))).toBe(true);
    for (const stalePath of [
      path.join('commands', '0_business_scenario.md'),
      path.join('.specify', 'commands', '0_business_scenario.md'),
      path.join('.github', 'prompts', '0_business_scenario.prompt.md'),
      path.join('.gemini', 'commands', 'gofer', '0_business_scenario.md'),
    ]) {
      expect(fs.existsSync(path.join(publicPluginRoot, stalePath)), stalePath).toBe(false);
    }

    const publicResearch = readPublicPlugin(path.join('commands', '1_gofer_research.md'));
    expect(publicResearch).toContain('.specify/commands/0_gofer_start.md');
    expect(publicResearch).toContain('## EAI Platform Session Preflight');
    expect(publicResearch).toContain('eai whoami');
    expect(publicResearch).not.toContain('.specify/commands/0_business_scenario.md');

    const publicCodexManifest = readPublicPlugin('codex-plugin.json');
    const publicGeminiManifest = readPublicPlugin('gemini-commands-manifest.json');
    expect(publicCodexManifest).toContain('"0_gofer_start"');
    expect(publicCodexManifest).not.toContain('0_business_scenario');
    expect(publicGeminiManifest).toContain('"0_gofer_start"');
    expect(publicGeminiManifest).not.toContain('0_business_scenario');

    const latestZip = path.join(
      REPO_ROOT,
      'docs-site',
      'static',
      'releases',
      'eai-gofer-agent-plugin-latest.zip'
    );
    const zipListing = execFileSync('unzip', ['-l', latestZip], { encoding: 'utf8' });
    expect(zipListing).toContain('eai-gofer/commands/0_gofer_start.md');
    expect(zipListing).not.toContain('0_business_scenario');
  });
});
