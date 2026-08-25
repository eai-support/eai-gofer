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
  it('keeps user-visible command surfaces to the public EAI entrypoint', () => {
    expect(read('extension/resources/claude-commands/eai.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('.github/prompts/eai.prompt.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host copilot --json'
    );
    expect(read('.agents/skills/eai/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.system/skills/eai/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(read('.gemini/commands/gofer/eai.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host gemini --json'
    );

    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/gofer.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.github/prompts/gofer.prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/gofer'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.system/skills/gofer'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer.toml'))).toBe(false);
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

  it('carries business English, journey routing, and EAI service choices across public surfaces', () => {
    for (const surfacePath of [
      'extension/resources/claude-commands/eai.md',
      '.github/prompts/eai.prompt.md',
      '.agents/skills/eai/SKILL.md',
      '.system/skills/eai/SKILL.md',
      '.gemini/commands/gofer/eai.md',
      'plugins/eai-gofer/skills/eai/SKILL.md',
    ]) {
      const surface = read(surfacePath);
      expect(surface).toContain('## Always-On EAI Contract');
      expect(surface).toContain('## User-Facing Response Gate');
      expect(surface).toContain('## Journey State');
      expect(surface).toContain('## EAI Platform Decision Contract');
      expect(surface).toContain('Apply the Controlled English Contract to every Gofer-authored');
      expect(surface).toContain('Find the earliest missing pipeline artifact or blocked EAI gate');
      expect(surface).toContain('Prefer PostgreSQL for relational');
      expect(surface).toContain('Prefer DocumentDB for flexible JSON documents');
      expect(surface).toContain('Prefer EAI content understanding and document services');
      expect(surface).toContain('Prefer EAI workflows, goals, and targets');
      expect(surface).toContain('Use any other platform only as an explicit exception');
      expect(surface).toContain('If any check fails, rewrite the reply before sending it');
      expect(surface).toContain('## Local Settings Cleanup Contract');
      expect(surface).toContain('gofer-local-settings-cleanup.mjs --workspace . --apply --json');
      expect(surface).toContain('## App Preview Runner Contract');
      expect(surface).toContain('./run.sh dev 3001');
      expect(surface).toContain('run.bat dev 3001');
    }
  });

  it('keeps EAI platform service guidance in repo-owned stage contracts', () => {
    expect(read('.specify/commands/0_gofer_start.md')).toContain('## Always-On EAI Contract');
    expect(read('.specify/commands/0_gofer_start.md')).toContain('## Journey State');
    expect(read('.specify/commands/1_gofer_research.md')).toContain(
      '## EAI Platform Capability Research'
    );
    expect(read('.specify/commands/2_gofer_specify.md')).toContain(
      '## EAI Platform Requirement Capture'
    );
    expect(read('.specify/commands/3_gofer_plan.md')).toContain('## EAI Platform Service Planning');
    expect(read('.specify/references/platform/eai-service-patterns.md')).toContain(
      '| Goals and targets'
    );
    expect(read('.specify/references/platform/eai-repo-contract.md')).toContain(
      '## Platform Service Choice Rule'
    );
  });

  it('keeps the response gate in direct GitHub Gofer agents', () => {
    const agentDir = path.join(REPO_ROOT, '.github', 'agents');
    const agentFiles = fs
      .readdirSync(agentDir)
      .filter((file) => file.startsWith('gofer-') && file.endsWith('.agent.md'));

    expect(agentFiles.length).toBeGreaterThan(0);
    for (const file of agentFiles) {
      const surface = read(path.join('.github', 'agents', file));
      expect(surface, file).toContain('## User-Facing Response Gate');
      expect(surface, file).toContain('If any check fails, rewrite the reply before sending it');
    }
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

    expect(fs.existsSync(path.join(publicPluginRoot, 'commands', 'eai.md'))).toBe(true);
    for (const stalePath of [
      path.join('commands', 'gofer.md'),
      path.join('skills', 'gofer', 'SKILL.md'),
      path.join('plugin-skills', 'gofer', 'SKILL.md'),
      path.join('.github', 'prompts', 'gofer.prompt.md'),
      path.join('.gemini', 'commands', 'gofer', 'gofer.md'),
      path.join('.gemini', 'commands', 'gofer', 'gofer.toml'),
      path.join('commands', '0_gofer_start.md'),
      path.join('commands', '0_business_scenario.md'),
      path.join('.specify', 'commands', '0_business_scenario.md'),
      path.join('.github', 'prompts', '0_business_scenario.prompt.md'),
      path.join('.gemini', 'commands', 'gofer', '0_business_scenario.md'),
    ]) {
      expect(fs.existsSync(path.join(publicPluginRoot, stalePath)), stalePath).toBe(false);
    }

    const publicEai = readPublicPlugin(path.join('commands', 'eai.md'));
    expect(publicEai).toContain('.specify/commands/0_gofer_start.md');
    expect(publicEai).toContain('## EAI Platform Readiness');
    expect(publicEai).toContain('eai whoami');
    expect(publicEai).not.toContain('.specify/commands/0_business_scenario.md');

    const publicCodexManifestText = readPublicPlugin(path.join('.codex-plugin', 'plugin.json'));
    const publicCodexManifest = JSON.parse(publicCodexManifestText);
    const publicGeminiManifest = readPublicPlugin(
      path.join('.gemini', 'commands', 'gofer', 'manifest.json')
    );
    expect(publicCodexManifest.skills).toBe('./skills/');
    expect(publicCodexManifest.gofer).toBeUndefined();
    expect(publicCodexManifestText).not.toContain('0_business_scenario');
    expect(publicGeminiManifest).toContain('"eai"');
    expect(publicGeminiManifest).not.toContain('"gofer"');
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
    expect(zipListing).toContain('eai-gofer/commands/eai.md');
    expect(zipListing).not.toContain('eai-gofer/commands/gofer.md');
    expect(zipListing).not.toContain('eai-gofer/skills/gofer/SKILL.md');
    expect(zipListing).not.toContain('eai-gofer/plugin-skills/gofer/SKILL.md');
    expect(zipListing).not.toContain('eai-gofer/commands/0_gofer_start.md');
    expect(zipListing).not.toContain('0_business_scenario');
  });
});
