/**
 * Verifies the Gofer Claude/Codex/Copilot plugin package.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSupportReportContract,
  buildContinuationContractSection,
  buildEaiHostingAndDeploymentContract,
} from '../../../.specify/scripts/node/generate-commands.mjs';
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
const FIRST_RUN_TRIGGER = 'Treat `Get started with EAI` as the first-run trigger';
const PACKAGED_EAI_CONTRACT_ENTRIES = [
  '.claude/skills/eai/SKILL.md',
  '.gemini/commands/gofer/eai.md',
  '.github/prompts/eai.prompt.md',
  '.github/skills/eai/SKILL.md',
  '.grok/skills/eai/SKILL.md',
  'commands/eai.md',
  'plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/.claude/skills/eai/SKILL.md',
  'plugins/eai-gofer/.gemini/commands/gofer/eai.md',
  'plugins/eai-gofer/.github/prompts/eai.prompt.md',
  'plugins/eai-gofer/.github/skills/eai/SKILL.md',
  'plugins/eai-gofer/.grok/skills/eai/SKILL.md',
  'plugins/eai-gofer/commands/eai.md',
  'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/skills/eai/SKILL.md',
  'skills/eai/SKILL.md',
] as const;

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
  it.each([false, true])(
    'packages a minimal valid source root with optional historical AGENTS=$hasAgents',
    (hasAgents) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-optional-agents-'));
      try {
        fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'extension/package.json'),
          JSON.stringify({ version: VERSION })
        );
        fs.copyFileSync(
          path.join(REPO_ROOT, 'extension/icon.png'),
          path.join(root, 'extension/icon.png')
        );
        fs.mkdirSync(path.join(root, '.specify/commands'), { recursive: true });
        fs.copyFileSync(
          path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'),
          path.join(root, '.specify/commands/0_gofer_start.md')
        );
        if (hasAgents)
          fs.writeFileSync(
            path.join(root, 'AGENTS.md'),
            `# Custom project\n\n## Support after an unresolved EAI error\nOld automatic offer.\n\n## Preserve custom\nKeep this.\n\n${buildSupportReportContract()}\n`
          );
        execFileSync('node', [SCRIPT_PATH, '--root', root, '--out-dir', 'out'], { stdio: 'pipe' });
        const pluginRoot = path.join(root, 'out', `eai-gofer-agent-plugin-${VERSION}`, 'eai-gofer');
        expect(fs.existsSync(path.join(root, 'out', `eai-gofer-agent-plugin-${VERSION}.zip`))).toBe(
          true
        );
        for (const relative of ['AGENTS.md', 'plugins/eai-gofer/AGENTS.md']) {
          const file = path.join(pluginRoot, relative);
          expect(fs.existsSync(file)).toBe(hasAgents);
          if (hasAgents) {
            const content = fs.readFileSync(file, 'utf8');
            expect(content).toContain('## Preserve custom\nKeep this.');
            expect(content).not.toContain('Support after an unresolved EAI error');
            expect(content).toContain(buildSupportReportContract());
            expect(content.split('## Support only when the person asks')).toHaveLength(2);
          }
        }
        expect(fs.readFileSync(path.join(pluginRoot, 'skills/eai/SKILL.md'), 'utf8')).toContain(
          '## Support only when the person asks'
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it.each(['symlink', 'directory'])(
    'rejects copied AGENTS as a %s before normalization',
    (kind) => {
      const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-agents-boundary-'));
      const root = path.join(outer, 'source');
      const outside = path.join(outer, 'outside.md');
      const original = '# Unrelated file\nKeep this byte-for-byte.\n';
      try {
        fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'extension/package.json'),
          JSON.stringify({ version: VERSION })
        );
        fs.copyFileSync(
          path.join(REPO_ROOT, 'extension/icon.png'),
          path.join(root, 'extension/icon.png')
        );
        fs.mkdirSync(path.join(root, '.specify/commands'), { recursive: true });
        fs.copyFileSync(
          path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'),
          path.join(root, '.specify/commands/0_gofer_start.md')
        );
        fs.writeFileSync(outside, original);
        if (kind === 'symlink') fs.symlinkSync(outside, path.join(root, 'AGENTS.md'));
        else fs.mkdirSync(path.join(root, 'AGENTS.md'));
        expect(() =>
          execFileSync(process.execPath, [SCRIPT_PATH, '--root', root, '--out-dir', 'out'], {
            stdio: 'pipe',
          })
        ).toThrow(/AGENTS\.md must be a regular file/);
        expect(fs.readFileSync(outside, 'utf8')).toBe(original);
      } finally {
        fs.rmSync(outer, { recursive: true, force: true });
      }
    }
  );

  it.each([
    'open-error',
    'open-enoent-present',
    'open-enoent-absent',
    'read-error',
    'write-error',
    'close-error',
    'short-write',
    'zero-write',
    'empty-input',
  ])('closes packaged AGENTS handles and preserves complete bytes for %s', (mode) => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-agents-handle-'));
    const root = path.join(outer, 'source'),
      trace = path.join(outer, 'trace.log');
    const original = mode === 'empty-input' ? '' : '# Local instructions\nUnicode: café λ.\n';
    try {
      fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'extension/package.json'),
        JSON.stringify({ version: VERSION })
      );
      fs.copyFileSync(
        path.join(REPO_ROOT, 'extension/icon.png'),
        path.join(root, 'extension/icon.png')
      );
      fs.mkdirSync(path.join(root, '.specify/commands'), { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'),
        path.join(root, '.specify/commands/0_gofer_start.md')
      );
      if (mode !== 'open-enoent-absent') fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
      const preload = path.join(outer, 'observe.mjs');
      fs.writeFileSync(
        preload,
        "import { promises as fs } from 'node:fs';\nimport path from 'node:path';\nconst mode = MODE, trace = TRACE;\nconst record = event => fs.appendFile(trace, event + '\\n');\nconst originalOpen = fs.open.bind(fs);\nfs.open = async (file, ...args) => {\n  const tracked = path.basename(String(file)) === 'AGENTS.md' && String(file).split(path.sep).includes('out');\n  if (tracked && mode === 'open-error') throw new Error('controlled AGENTS open failure');\n  if (tracked && mode.startsWith('open-enoent-')) throw Object.assign(new Error('controlled AGENTS ENOENT'), { code: 'ENOENT' });\n  const handle = await originalOpen(file, ...args);\n  if (!tracked) return handle;\n  await record('opened');\n  const originalClose = handle.close.bind(handle);\n  handle.close = async () => { try { const value = await originalClose(); if (mode === 'close-error') throw new Error('controlled AGENTS close failure'); return value; } finally { await record('closed'); } };\n  const originalRead = handle.readFile.bind(handle);\n  handle.readFile = async (...readArgs) => { if (mode === 'read-error') throw new Error('controlled AGENTS read failure'); return originalRead(...readArgs); };\n  const originalWrite = handle.write.bind(handle);\n  handle.write = async (buffer, offset, length, position) => {\n    if (mode === 'write-error') throw new Error('controlled AGENTS write failure');\n    if (mode === 'zero-write') return { bytesWritten: 0, buffer };\n    return originalWrite(buffer, offset, mode === 'short-write' ? Math.min(length, 17) : length, position);\n  };\n  return handle;\n};\nconst originalReadFile = fs.readFile.bind(fs), originalWriteFile = fs.writeFile.bind(fs);\nfs.readFile = async (file, ...args) => { if (mode === 'read-error' && path.basename(String(file)) === 'AGENTS.md' && String(file).split(path.sep).includes('out')) throw new Error('controlled AGENTS read failure'); return originalReadFile(file, ...args); };\nfs.writeFile = async (file, ...args) => { if (mode === 'write-error' && path.basename(String(file)) === 'AGENTS.md' && String(file).split(path.sep).includes('out')) throw new Error('controlled AGENTS write failure'); return originalWriteFile(file, ...args); };\n"
          .replace('MODE', JSON.stringify(mode))
          .replace('TRACE', JSON.stringify(trace))
      );
      const result = spawnSync(
        process.execPath,
        ['--import', preload, SCRIPT_PATH, '--root', root, '--out-dir', 'out'],
        { encoding: 'utf8' }
      );
      const events = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n') : [];
      if (mode === 'open-enoent-absent') {
        expect(result.status, result.stderr).toBe(0);
        expect(events).toEqual([]);
      } else if (mode === 'open-enoent-present') {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('controlled AGENTS ENOENT');
        expect(events).toEqual([]);
      } else if (mode === 'open-error') {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('controlled AGENTS open failure');
        expect(events).toEqual([]);
      } else {
        expect(events).toEqual(['opened', 'closed']);
        if (mode === 'short-write' || mode === 'empty-input') {
          expect(result.status, result.stderr).toBe(0);
          execFileSync(process.execPath, [SCRIPT_PATH, '--root', root, '--out-dir', 'control'], {
            stdio: 'pipe',
          });
          const entry = `eai-gofer-agent-plugin-${VERSION}/eai-gofer/AGENTS.md`;
          const actual = fs.readFileSync(path.join(root, 'out', entry));
          expect(actual).toEqual(fs.readFileSync(path.join(root, 'control', entry)));
          expect(actual.toString()).toContain(original.trim());
          expect(actual.includes(0)).toBe(false);
        } else {
          expect(result.status).not.toBe(0);
          expect(result.stderr).toContain(
            mode === 'zero-write'
              ? 'AGENTS.md normalization write made no progress.'
              : `controlled AGENTS ${mode.split('-')[0]} failure`
          );
        }
      }
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });

  it('packages a zip with current-host metadata and Gemini legacy compatibility', (): void => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eai-gofer-plugin-'));
    try {
      execFileSync('node', [SCRIPT_PATH, '--version', VERSION, '--out-dir', outDir], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      const zipPath = path.join(outDir, `eai-gofer-agent-plugin-${VERSION}.zip`);
      const pluginRoot = path.join(outDir, `eai-gofer-agent-plugin-${VERSION}`, 'eai-gofer');
      const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
      expect(readme).toContain('Copilot, Grok,\nand VS Code');
      expect(readme).toContain('`--company-tenant` compatibility alias');
      expect(readme).toContain(
        'reuse the original-failure guidance for `app_token_tenant_context_required`'
      );
      expect(readme).toContain('only if it has not been queried');
      expect(readme).toContain('No static provider default qualifies a model');
      expect(readme).not.toContain('Copilot\ndefaults to `Auto`');
      for (const manifest of [
        'plugin.json',
        '.github/plugin/plugin.json',
        '.codex-plugin/plugin.json',
      ]) {
        expect(
          readJson<{ keywords: string[] }>(path.join(pluginRoot, manifest)).keywords
        ).toContain('grok');
      }
      const umbrellaSkill = fs.readFileSync(
        path.join(pluginRoot, 'plugin-skills', 'eai', 'SKILL.md'),
        'utf8'
      );
      expect(umbrellaSkill).toContain(buildContinuationContractSection());
      expect(umbrellaSkill).toContain(buildEaiHostingAndDeploymentContract());
      // Codex plugins load root skills; repo-local Codex skills use .agents.
      for (const surface of ['skills', '.claude/skills', '.github/skills']) {
        const skill = fs.readFileSync(path.join(pluginRoot, surface, 'eai', 'SKILL.md'), 'utf8');
        expect(skill).toContain(buildContinuationContractSection());
      }
      for (const stagedRoot of [pluginRoot, path.join(pluginRoot, 'plugins', 'eai-gofer')]) {
        const eaiSkill = fs.readFileSync(
          path.join(stagedRoot, 'skills', 'eai', 'SKILL.md'),
          'utf8'
        );
        const updateSkill = fs.readFileSync(
          path.join(stagedRoot, 'skills', 'eai-update', 'SKILL.md'),
          'utf8'
        );
        expect(eaiSkill).toContain(FIRST_RUN_TRIGGER);
        expect(eaiSkill).toContain(buildEaiHostingAndDeploymentContract());
        expect(updateSkill).not.toContain(FIRST_RUN_TRIGGER);
        expect(updateSkill).not.toContain('## First Conversation');
      }
      expect(
        fs.readFileSync(path.join(REPO_ROOT, '.agents/skills/eai/SKILL.md'), 'utf8')
      ).toContain(buildContinuationContractSection());
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
        'eai-gofer/.claude-plugin/hooks/hooks.json',
        'eai-gofer/.agents/plugins/marketplace.json',
        'eai-gofer/.github/plugin/marketplace.json',
        'eai-gofer/gemini-extension.json',
        'eai-gofer/plugins/eai-gofer/plugin.json',
        'eai-gofer/README.md',
        'eai-gofer/assets/eai-gofer-icon.png',
        'eai-gofer/.claude/skills/eai/SKILL.md',
        'eai-gofer/.github/agents/eai.agent.md',
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
        'eai-gofer/.specify/scripts/node/gofer-local-settings-cleanup.mjs',
        'eai-gofer/.specify/scripts/node/gofer-agent-catalog.mjs',
        'eai-gofer/.specify/scripts/node/gofer-verified-execution.mjs',
        'eai-gofer/.specify/scripts/node/gofer-acceptance-check.mjs',
        'eai-gofer/.specify/scripts/node/gofer-execution-recovery.mjs',
        'eai-gofer/.specify/scripts/node/gofer-execution-metrics.mjs',
        'eai-gofer/.specify/scripts/node/gofer-benchmark.mjs',
        'eai-gofer/.specify/scripts/node/gofer-host-capability.mjs',
        'eai-gofer/.specify/scripts/node/gofer-live-routing.mjs',
        'eai-gofer/.specify/scripts/node/gofer-local-isolation.mjs',
        'eai-gofer/.specify/scripts/node/gofer-native-adapter.mjs',
        'eai-gofer/.specify/scripts/node/gofer-native-runtime.mjs',
        'eai-gofer/.specify/scripts/node/gofer-heldout-corpus.mjs',
        'eai-gofer/.specify/references/agent-catalog.json',
        'eai-gofer/.specify/references/verified-agent-execution.md',
        'eai-gofer/.specify/scripts/node/gofer-ui-preview.mjs',
        'eai-gofer/commands/eai.md',
        'eai-gofer/skills/eai/SKILL.md',
      ]) {
        expect(zipListing).toContain(required);
      }
      expect(zipEntries).not.toContain('eai-gofer/.vscode/mcp.json');
      const canonicalHostingContract = buildEaiHostingAndDeploymentContract();
      for (const relativeEntry of PACKAGED_EAI_CONTRACT_ENTRIES) {
        const stagedContent = fs.readFileSync(path.join(pluginRoot, relativeEntry), 'utf8');
        const zipEntry = `eai-gofer/${relativeEntry}`;
        const archivedContent = execFileSync('unzip', ['-p', zipPath, zipEntry], {
          encoding: 'utf8',
        });

        expect(stagedContent, relativeEntry).toContain(canonicalHostingContract);
        expect(archivedContent, zipEntry).toBe(stagedContent);
        expect(archivedContent, zipEntry).toContain(canonicalHostingContract);
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
        plugins: Array<{ name: string; source: string; version: string; tags: string[] }>;
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
      const copilotAgent = fs.readFileSync(
        path.join(pluginRoot, '.github', 'agents', 'eai.agent.md'),
        'utf8'
      );
      expect(copilotAgent).toContain('Use `.github/prompts/eai.prompt.md` as the canonical');
      expect(copilotAgent).toContain('.specify/commands/*.md');
      expect(claudeManifest.skills).toBe('./skills/');
      expect(claudeManifest.agents).toBeUndefined();
      expect(claudeManifest.commands).toBeUndefined();
      expect(codexManifest.skills).toBe('./skills/');
      expect(codexManifest).not.toHaveProperty('gofer');
      expect(claudeMarketplace.name).toBe('eai-gofer');
      expect(claudeMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
      expect(claudeMarketplace.plugins[0].tags).toEqual(expect.arrayContaining(['grok', 'vscode']));
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
      expect(readme).toContain('Google Antigravity');
      expect(readme).toContain('Gemini files remain only for legacy compatibility');
      expect(readme).not.toContain('Gemini CLI | `gemini extensions install');
      expect(readme).toContain('eai agent guide --format json');
      expect(readme).toContain('eai errors explain <code-or-reason> --format json');
      expect(readme).toContain('does not invent EAI CLI commands');
      expect(readme).toContain(
        'eai user role set --workspace <workspace-id> --member-id <member-id> --role tenant-admin --format json'
      );
      expect(readme).toContain('App-Native Surfaces And Repo Scripts');
      expect(readme).toContain('Update Cleanup');
      expect(readme).toContain('gofer-local-settings-cleanup.mjs --workspace . --apply --json');
      expect(readme).toContain('./run.sh dev 3001');
      expect(readme).toContain('run.bat dev 3001');
      expect(readme).toContain('Codex App / Codex IDE');
      expect(readme).toContain('GitHub Copilot app / VS Code agent mode');
      expect(readme).toContain('Claude Code app');
      expect(umbrellaSkill).toContain('eai agent guide --format json');
      expect(umbrellaSkill).toContain(
        'reuse the original-failure guidance for `app_token_tenant_context_required`'
      );
      expect(umbrellaSkill).toContain('only if it has not been queried');
      expect(umbrellaSkill).toContain('eai errors explain <code-or-reason> --format json');
      expect(umbrellaSkill).toContain(
        'Do not invent, guess, or complete EAI CLI commands from memory'
      );
      expect(umbrellaSkill).toContain('eai <command> --help');
      expect(umbrellaSkill).toContain('If the command is not listed or help fails, do not run it');
      expect(umbrellaSkill).toContain(
        'eai user role set --workspace <workspace-id> --member-id <member-id> --role tenant-admin --format json'
      );
      expect(umbrellaSkill).toContain('eai publicapi');
      expect(umbrellaSkill).toContain('## Controlled English Contract');
      expect(umbrellaSkill).toContain(
        'Apply this skill to every request when the plugin is enabled'
      );
      expect(umbrellaSkill).toContain('ASD-STE100 Simplified Technical English');
      expect(umbrellaSkill).toContain('Use one action per instruction');
      expect(umbrellaSkill).toContain('do not claim ASD certification');
      expect(umbrellaSkill).toContain('## User-Facing Response Gate');
      expect(umbrellaSkill).toContain('If any check fails, rewrite the reply before sending it');
      expect(umbrellaSkill).toContain('## Local Settings Cleanup Contract');
      expect(umbrellaSkill).toContain(
        'gofer-local-settings-cleanup.mjs --workspace . --apply --json'
      );
      expect(umbrellaSkill).toContain('## App Preview Runner Contract');
      expect(umbrellaSkill).toContain('./run.sh dev 3001');
      expect(umbrellaSkill).toContain('run.bat dev 3001');
      expect(
        fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'hooks', 'hooks.json'), 'utf8')
      ).toContain('UserPromptSubmit');

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
      expect(fs.existsSync(path.join(pluginRoot, 'plugin-skills', 'gofer', 'SKILL.md'))).toBe(
        false
      );
      expect(fs.existsSync(path.join(pluginRoot, 'skills', 'eai', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(pluginRoot, 'skills', 'gofer', 'SKILL.md'))).toBe(false);
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
      plugins: Array<{ source: string; tags: string[] }>;
    }>(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
    const copilotMarketplace = readJson<{
      plugins: Array<{ source: string; tags: string[] }>;
    }>(path.join(REPO_ROOT, '.github', 'plugin', 'marketplace.json'));
    const codexMarketplace = readJson<{
      plugins: Array<{ source: { source: string; path: string } }>;
    }>(path.join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json'));

    expect(claudeMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
    expect(copilotMarketplace.plugins[0].source).toBe('./plugins/eai-gofer');
    for (const marketplace of [claudeMarketplace, copilotMarketplace]) {
      expect(marketplace.plugins[0].tags).toEqual(expect.arrayContaining(['grok', 'vscode']));
    }
    for (const prefix of ['plugins/eai-gofer', 'plugins/eai-gofer/plugins/eai-gofer']) {
      const eaiAgent = fs.readFileSync(
        path.join(REPO_ROOT, prefix, '.github', 'agents', 'eai.agent.md'),
        'utf8'
      );
      expect(eaiAgent).toContain('Use `.github/prompts/eai.prompt.md` as the canonical');
      expect(eaiAgent).toContain('.specify/commands/*.md');

      for (const suffix of ['.claude-plugin/marketplace.json', '.github/plugin/marketplace.json']) {
        const marketplace = readJson<{ plugins: Array<{ tags: string[] }> }>(
          path.join(REPO_ROOT, prefix, suffix)
        );
        expect(marketplace.plugins[0].tags).toEqual(expect.arrayContaining(['grok', 'vscode']));
      }
    }
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
    expect(workflow).toContain('az account get-access-token');
    expect(workflow).toContain('--resource 499b84ac-1321-427f-aa17-267ca6975798');
    expect(workflow).toContain('VSCE_AZURE_CLIENT_ID');
    expect(workflow).not.toContain('VSCE_PAT');
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
