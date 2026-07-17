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
  it('keeps user-visible command surfaces to the public Gofer entrypoints', () => {
    expect(read('.claude/commands/gofer.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('extension/resources/claude-commands/eai-gofer.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('.github/prompts/gofer.prompt.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host copilot --json'
    );
    expect(read('.agents/skills/gofer/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.system/skills/eai-gofer/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.gemini/commands/gofer/gofer.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host gemini --json'
    );

    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/0_gofer_start.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.github/prompts/0_gofer_start.prompt.md'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/0_gofer_start'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/0_gofer_start.md'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'))).toBe(true);
  });

  it('does not expose pure control commands in user-visible command folders', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/gofer_plan.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/gofer_plan'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer_plan.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.specify/commands/gofer_plan.md'))).toBe(true);
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

    expect(fs.existsSync(path.join(publicPluginRoot, 'commands', 'gofer.md'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'commands', 'eai-gofer.md'))).toBe(true);
    for (const stalePath of [
      path.join('commands', '0_gofer_start.md'),
      path.join('commands', '0_business_scenario.md'),
      path.join('.specify', 'commands', '0_business_scenario.md'),
      path.join('.github', 'prompts', '0_business_scenario.prompt.md'),
      path.join('.gemini', 'commands', 'gofer', '0_business_scenario.md'),
    ]) {
      expect(fs.existsSync(path.join(publicPluginRoot, stalePath)), stalePath).toBe(false);
    }

    const publicGofer = readPublicPlugin(path.join('commands', 'gofer.md'));
    expect(publicGofer).toContain('.specify/commands/0_gofer_start.md');
    expect(publicGofer).toContain('## EAI Platform Readiness');
    expect(publicGofer).toContain('eai whoami');
    expect(publicGofer).not.toContain('.specify/commands/0_business_scenario.md');

    const publicCodexManifest = readPublicPlugin(path.join('.codex-plugin', 'plugin.json'));
    const publicGeminiManifest = readPublicPlugin(
      path.join('.gemini', 'commands', 'gofer', 'manifest.json')
    );
    expect(publicCodexManifest).toContain('"gofer"');
    expect(publicCodexManifest).toContain('"eai-gofer"');
    expect(publicCodexManifest).not.toContain('0_business_scenario');
    expect(publicGeminiManifest).toContain('"gofer"');
    expect(publicGeminiManifest).toContain('"eai-gofer"');
    expect(publicGeminiManifest).not.toContain('0_gofer_start');
    expect(publicGeminiManifest).not.toContain('0_business_scenario');

    const latestZip = path.join(
      REPO_ROOT,
      'docs-site',
      'static',
      'releases',
      'eai-gofer-agent-plugin-latest.zip'
    );
    const zipListing = execFileSync('unzip', ['-l', latestZip], { encoding: 'utf8' });
    expect(zipListing).toContain('eai-gofer/commands/gofer.md');
    expect(zipListing).toContain('eai-gofer/commands/eai-gofer.md');
    expect(zipListing).not.toContain('eai-gofer/commands/0_gofer_start.md');
    expect(zipListing).not.toContain('0_business_scenario');
  });
});
