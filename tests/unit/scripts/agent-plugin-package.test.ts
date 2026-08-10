/**
 * Verifies the Gofer Claude/Codex/Copilot plugin package.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_COMMAND_FILES,
  PUBLIC_ENTRYPOINT_COUNT,
  PUBLIC_ENTRYPOINT_FILES,
} from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'package-agent-plugin.mjs');
const VERSION = '3.4.0';

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function walkFiles(root: string): string[] {
  const results: string[] = [];

  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  visit(root);
  return results;
}

function walkRelativePaths(root: string): string[] {
  const results: string[] = [];

  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      results.push(path.relative(root, fullPath).split(path.sep).join('/'));
      if (entry.isDirectory()) {
        visit(fullPath);
      }
    }
  }

  visit(root);
  return results;
}

function findWindowsUnsafePaths(paths: string[]): string[] {
  const forbiddenSegmentChars = new Set(['<', '>', ':', '"', '\\', '|', '?', '*']);
  const reservedBasename = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const hasForbiddenChar = (segment: string): boolean => {
    for (const char of segment) {
      if (forbiddenSegmentChars.has(char) || char.charCodeAt(0) < 32) {
        return true;
      }
    }

    return false;
  };

  return paths.filter((relativePath) => {
    if (relativePath.length > 240) {
      return true;
    }

    return relativePath
      .split('/')
      .filter(Boolean)
      .some(
        (segment) =>
          hasForbiddenChar(segment) || /[ .]$/.test(segment) || reservedBasename.test(segment)
      );
  });
}

describe('Gofer agent plugin package', () => {
  it('packages a zip with Claude, Codex, Copilot, and Gemini install metadata', (): void => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eai-gofer-plugin-'));
    try {
      execFileSync('node', [SCRIPT_PATH, '--version', VERSION, '--out-dir', outDir], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      const zipPath = path.join(outDir, `eai-gofer-agent-plugin-${VERSION}.zip`);
      const pluginRoot = path.join(outDir, `eai-gofer-agent-plugin-${VERSION}`, 'eai-gofer');
      const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
      const umbrellaSkill = fs.readFileSync(
        path.join(pluginRoot, 'plugin-skills', 'eai', 'SKILL.md'),
        'utf8'
      );
      expect(fs.existsSync(zipPath)).toBe(true);
      expect(fs.existsSync(pluginRoot)).toBe(true);

      const zipListing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
      const zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
      expect(findWindowsUnsafePaths(walkRelativePaths(pluginRoot))).toEqual([]);
      expect(findWindowsUnsafePaths(zipEntries)).toEqual([]);

      for (const required of [
        'eai-gofer/plugin.json',
        'eai-gofer/.codex-plugin/plugin.json',
        'eai-gofer/.claude-plugin/plugin.json',
        'eai-gofer/.agents/plugins/marketplace.json',
        'eai-gofer/.github/plugin/marketplace.json',
        'eai-gofer/gemini-extension.json',
        'eai-gofer/plugins/eai-gofer/plugin.json',
        'eai-gofer/README.md',
        'eai-gofer/assets/eai-gofer-icon.png',
        'eai-gofer/.vscode/mcp.json',
        'eai-gofer/.claude/skills/eai/SKILL.md',
        'eai-gofer/.github/agents/gofer-business.agent.md',
        'eai-gofer/.github/skills/eai/SKILL.md',
        'eai-gofer/.specify/references/platform/README.md',
        'eai-gofer/.specify/references/platform/eai.md',
        'eai-gofer/.specify/references/platform/eai-repo-contract.md',
        'eai-gofer/.specify/references/platform/eai-error-catalog.yaml',
        'eai-gofer/.specify/config/object-type-routing.json',
        'eai-gofer/.specify/contracts/object-type-routing-v1.json',
        'eai-gofer/.specify/schemas/object-type-identifier-audit-v1.schema.json',
        'eai-gofer/.specify/schemas/object-type-routing-phase-bundle-v1.schema.json',
        'eai-gofer/.specify/templates/gofer-model-policy.yaml',
        'eai-gofer/commands/gofer.md',
        'eai-gofer/commands/eai.md',
        'eai-gofer/skills/gofer/SKILL.md',
        'eai-gofer/skills/eai/SKILL.md',
      ]) {
        expect(zipListing).toContain(required);
      }

      const copilotManifest = readJson<{
        name: string;
        version: string;
        skills: string;
        agents?: string;
        commands?: string;
      }>(path.join(pluginRoot, 'plugin.json'));
      const claudeManifest = readJson<{
        name: string;
        version: string;
        skills: string;
        agents?: string;
        commands?: string;
      }>(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
      const codexManifest = readJson<{ name: string; version: string; skills: string }>(
        path.join(pluginRoot, '.codex-plugin', 'plugin.json')
      );
      const claudeMarketplace = readJson<{
        name: string;
        plugins: Array<{ name: string; source: string; version: string }>;
      }>(path.join(pluginRoot, '.claude-plugin', 'marketplace.json'));
      const codexMarketplace = readJson<{
        name: string;
        plugins: Array<{ name: string; source: { source: string; path: string }; version: string }>;
      }>(path.join(pluginRoot, '.agents', 'plugins', 'marketplace.json'));

      for (const manifest of [copilotManifest, claudeManifest, codexManifest]) {
        expect(manifest.name).toBe('eai-gofer');
        expect(manifest.version).toBe(VERSION);
      }
      expect(copilotManifest.skills).toBe('./plugin-skills/');
      expect(copilotManifest.agents).toBe('./agents/');
      expect(copilotManifest.commands).toBe('./commands/');
      expect(claudeManifest.skills).toBe('./skills/');
      expect(claudeManifest.agents).toBeUndefined();
      expect(claudeManifest.commands).toBeUndefined();
      expect(codexManifest.skills).toBe('./plugin-skills/');
      expect(claudeMarketplace.name).toBe('eai-gofer');
      expect(claudeMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
      expect(codexMarketplace.name).toBe('eai-gofer');
      expect(codexMarketplace.plugins[0].source).toEqual({
        source: 'local',
        path: './plugins/eai-gofer',
      });
      expect(readme).toContain(
        'claude plugin marketplace add https://github.com/eai-support/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer'
      );
      expect(readme).toContain(
        'codex plugin marketplace add https://github.com/eai-support/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer'
      );
      expect(readme).toContain(
        'copilot plugin marketplace add https://github.com/eai-support/eai-gofer'
      );
      expect(readme).toContain(
        'gemini extensions install https://github.com/eai-support/eai-gofer'
      );
      expect(readme).toContain('eai agent guide --format json');
      expect(readme).toContain('eai errors explain <code-or-reason> --format json');
      expect(readme).toContain(
        'eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json'
      );
      expect(readme).toContain('App-Native Surfaces And Repo Scripts');
      expect(readme).toContain('Codex App / Codex IDE');
      expect(readme).toContain('GitHub Copilot app / VS Code agent mode');
      expect(readme).toContain('Claude Code app');
      expect(umbrellaSkill).toContain('eai agent guide --format json');
      expect(umbrellaSkill).toContain('eai errors explain <code-or-reason> --format json');
      expect(umbrellaSkill).toContain(
        'eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json'
      );
      expect(umbrellaSkill).toContain('eai publicapi');
      expect(umbrellaSkill).toContain('## Controlled English Contract');
      expect(umbrellaSkill).toContain('ASD-STE100 Simplified Technical English');
      expect(umbrellaSkill).toContain('Use one action per instruction');
      expect(umbrellaSkill).toContain('do not claim ASD certification');

      for (const command of PUBLIC_ENTRYPOINT_FILES) {
        expect(fs.existsSync(path.join(pluginRoot, 'commands', `${command}.md`))).toBe(true);
        expect(fs.existsSync(path.join(pluginRoot, 'skills', command, 'SKILL.md'))).toBe(true);
      }
      for (const command of FULL_COMMAND_FILES) {
        expect(fs.existsSync(path.join(pluginRoot, '.specify', 'commands', `${command}.md`))).toBe(
          true
        );
        expect(fs.existsSync(path.join(pluginRoot, 'commands', `${command}.md`))).toBe(false);
        expect(fs.existsSync(path.join(pluginRoot, 'skills', command, 'SKILL.md'))).toBe(false);
      }
      expect(fs.existsSync(path.join(pluginRoot, 'plugin-skills', 'eai', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(pluginRoot, 'plugin-skills', 'gofer', 'SKILL.md'))).toBe(true);
      expect(
        fs
          .readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory()).length
      ).toBe(PUBLIC_ENTRYPOINT_COUNT);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('committed repo-local plugin bundle has no personal or private internal paths', (): void => {
    const pluginRoot = path.join(REPO_ROOT, 'plugins', 'eai-gofer');
    const offenders: string[] = [];
    const forbidden = [
      /\/Users\/[^/\s"']+/,
      /[A-Za-z]:\\Users\\/,
      /\bgofer-pro\b/i,
      /\beai-stack\b/i,
      /\beai-internal\b/i,
    ];

    for (const file of walkFiles(pluginRoot)) {
      let content = '';
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      if (forbidden.some((pattern) => pattern.test(content))) {
        offenders.push(path.relative(pluginRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('repo root exposes marketplace files for repo-based CLI installs', (): void => {
    const claudeMarketplace = readJson<{
      plugins: Array<{ source: string }>;
    }>(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
    const copilotMarketplace = readJson<{
      plugins: Array<{ source: string }>;
    }>(path.join(REPO_ROOT, '.github', 'plugin', 'marketplace.json'));
    const codexMarketplace = readJson<{
      plugins: Array<{ source: { source: string; path: string } }>;
    }>(path.join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json'));

    expect(claudeMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
    expect(copilotMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
    expect(codexMarketplace.plugins[0].source).toEqual({
      source: 'local',
      path: './plugins/eai-gofer',
    });
    expect(fs.existsSync(path.join(REPO_ROOT, 'gemini-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'plugin-skills', 'eai', 'SKILL.md'))).toBe(true);
  });

  it('release workflow publishes VSIX and agent plugin assets', (): void => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'release.yml'),
      'utf8'
    );

    expect(workflow).toContain('npm run gofer:package-plugin');
    expect(workflow).toContain('eai-gofer-agent-plugin-${{ steps.version.outputs.version }}.zip');
    expect(workflow).toContain('VSCE_PAT');
    expect(workflow).toContain('vsce publish --packagePath');
    expect(workflow).toContain('softprops/action-gh-release@v3');
    expect(workflow).toContain(
      'https://github.com/eai-support/eai-gofer --scope user --sparse .claude-plugin --sparse plugins/eai-gofer'
    );
    expect(workflow).toContain(
      'https://github.com/eai-support/eai-gofer --sparse .agents/plugins --sparse plugins/eai-gofer'
    );
    expect(workflow).toContain('https://github.com/eai-support/eai-gofer');
  });
});
