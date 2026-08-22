import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECK_SCRIPT = path.join(
  REPO_ROOT,
  '.specify',
  'scripts',
  'node',
  'gofer-workspace-check.mjs'
);
const BOOTSTRAP_SCRIPT = path.join(
  REPO_ROOT,
  '.specify',
  'scripts',
  'node',
  'gofer-workspace-bootstrap.mjs'
);

function runJson(scriptPath: string, args: string[]) {
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  expect(result.stderr).toBe('');
  expect(result.stdout.trim().length).toBeGreaterThan(0);

  return {
    exitCode: result.status,
    payload: JSON.parse(result.stdout),
  };
}

function findFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

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

describe('Gofer workspace bootstrap scripts', () => {
  let workspaceRoot = '';

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-workspace-bootstrap-'));
    fs.mkdirSync(path.join(workspaceRoot, '.git'));
    fs.writeFileSync(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'bootstrap-fixture',
          version: '1.0.0',
          scripts: {
            build: 'tsc',
            test: 'vitest run',
            lint: 'eslint .',
            format: 'prettier --write .',
          },
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reports missing then bootstraps a healthy Claude workspace without repo-local mirrors', () => {
    const initial = runJson(CHECK_SCRIPT, [
      '--workspace',
      workspaceRoot,
      '--host',
      'claude',
      '--json',
    ]);
    expect(initial.exitCode).toBe(2);
    expect(initial.payload.status).toBe('missing');
    expect(initial.payload.missingCore).toContain('.specify/.gofer-version');

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);
    expect(bootstrap.payload.status).toBe('healthy');

    for (const relativePath of [
      '.specify/.gofer-version',
      '.specify/commands/0_gofer_start.md',
      '.specify/references/platform/README.md',
      '.specify/references/platform/eai.md',
      '.specify/references/platform/eai-repo-contract.md',
      '.specify/references/platform/eai-error-catalog.yaml',
      '.specify/templates/spec-template.md',
      '.specify/templates/build-map-template.md',
      '.specify/templates/loop-contract-template.json',
      '.specify/templates/working-backwards-prfaq-template.md',
      '.specify/templates/business-owner-summary-template.md',
      '.specify/templates/cto-architecture-summary-template.md',
      '.specify/templates/ciso-security-summary-template.md',
      '.specify/templates/stakeholder-review-index-template.md',
      '.specify/templates/gofer-model-policy.yaml',
      '.specify/memory/gofer-model-policy.yaml',
      '.specify/scripts/node/gofer-loop-audit.mjs',
      '.specify/scripts/node/gofer-ui-preview.mjs',
      '.specify/scripts/hooks/post-tool-use.mjs',
      '.specify/scripts/powershell/install-optional-tools.ps1',
      '.specify/README.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/settings.json',
      '.gitignore',
    ]) {
      expect(
        fs.existsSync(path.join(workspaceRoot, relativePath)),
        `${relativePath} should exist`
      ).toBe(true);
    }

    expect(fs.existsSync(path.join(workspaceRoot, '.claude', 'commands'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills'))).toBe(false);

    const post = runJson(CHECK_SCRIPT, [
      '--workspace',
      workspaceRoot,
      '--host',
      'claude',
      '--json',
    ]);
    expect(post.exitCode).toBe(0);
    expect(post.payload.status).toBe('healthy');

    const embeddedCheckScript = path.join(
      workspaceRoot,
      '.specify',
      'scripts',
      'node',
      'gofer-workspace-check.mjs'
    );
    const embeddedPost = runJson(embeddedCheckScript, [
      '--workspace',
      workspaceRoot,
      '--host',
      'claude',
      '--json',
    ]);
    expect(embeddedPost.exitCode).toBe(0);
    expect(embeddedPost.payload.status).toBe('healthy');
    expect(embeddedPost.payload.expectedVersion).toBe(embeddedPost.payload.actualVersion);
  });

  it('does not overwrite existing instruction files by default', () => {
    const customAgents = '# custom agents\n';
    const customClaude = '# custom claude\n';
    const customModelPolicy = 'version: 1\nprofile: custom\n';
    fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), customAgents);
    fs.writeFileSync(path.join(workspaceRoot, 'CLAUDE.md'), customClaude);
    fs.mkdirSync(path.join(workspaceRoot, '.specify', 'memory'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, '.specify', 'memory', 'gofer-model-policy.yaml'),
      customModelPolicy
    );

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);

    expect(fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8')).toBe(customAgents);
    expect(fs.readFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'utf8')).toBe(customClaude);
    expect(
      fs.readFileSync(
        path.join(workspaceRoot, '.specify', 'memory', 'gofer-model-policy.yaml'),
        'utf8'
      )
    ).toBe(customModelPolicy);
  });

  it('adds EAI repo guidance to generated instruction files when template markers exist', () => {
    fs.mkdirSync(path.join(workspaceRoot, 'src', 'eai.config'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'src', 'eai.config', 'object-types.ts'),
      'export {};\n'
    );
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'eai.config', 'register.ts'), 'export {};\n');

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);

    const agents = fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'utf8');

    expect(agents).toContain('## EAI Repo Contract');
    expect(agents).toContain('public `eai` entrypoint');
    expect(agents).toContain('.specify/commands/gofer_eai_first_run.md');
    expect(agents).toContain('.specify/references/platform/eai-error-catalog.yaml');
    expect(agents).toContain('eai agent guide --format json');
    expect(agents).toContain('eai errors explain <code-or-reason> --format json');
    expect(agents).toContain('Do not invent, guess, or complete EAI CLI commands from memory');
    expect(agents).toContain('command-specific `--help`');
    expect(agents).toContain(
      'eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json'
    );
    expect(agents).toContain('sign out and sign back in');
    expect(agents).toContain('app_token_tenant_context_required');
    expect(agents).toContain('/v4/platform/tenants/<tenant-id>/...');
    expect(claude).toContain('## EAI Repo Contract');
    expect(claude).toContain('eai agent guide --format json');
    expect(claude).toContain('eai template check --format json');
    expect(claude).toContain('Do not invent, guess, or complete EAI CLI commands from memory');
  });

  it('does not classify a repo as EAI-initialized when only manifest.yml exists', () => {
    fs.writeFileSync(path.join(workspaceRoot, 'manifest.yml'), 'name: generic-app\n');

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);

    const agents = fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'utf8');

    expect(agents).not.toContain('## EAI Repo Contract');
    expect(claude).not.toContain('## EAI Repo Contract');
  });

  it('adds EAI repo guidance when eai.runtime.json exists', () => {
    fs.writeFileSync(path.join(workspaceRoot, 'eai.runtime.json'), '{"schemaVersion":1}\n');

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);

    const agents = fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'utf8');

    expect(agents).toContain('## EAI Repo Contract');
    expect(claude).toContain('## EAI Repo Contract');
  });

  it('archives legacy command entrypoints instead of deleting user content', () => {
    const legacyPath = path.join(workspaceRoot, '.specify', 'commands', '0_business_scenario.md');
    const customLegacyContent = '# Custom legacy start command\n\nKeep this local note.\n';
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, customLegacyContent);

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);
    expect(bootstrap.exitCode).toBe(0);

    expect(fs.existsSync(legacyPath)).toBe(false);
    const archiveRoot = path.join(workspaceRoot, '.specify', 'logs', 'legacy-command-backups');
    const archivedFiles = findFiles(archiveRoot);
    const archivedLegacyPath = archivedFiles.find((filePath) =>
      filePath.endsWith(path.join('.specify', 'commands', '0_business_scenario.md'))
    );

    expect(archivedLegacyPath, 'expected legacy command backup').toBeTruthy();
    expect(fs.readFileSync(String(archivedLegacyPath), 'utf8')).toBe(customLegacyContent);
    expect(JSON.stringify(bootstrap.payload.changed)).toContain('archived legacy');
  });

  it('archives stale user-visible stage and alias mirrors during refresh', () => {
    const staleFiles = new Map([
      ['.claude/commands/gofer.md', '# Local stale Gofer alias\n'],
      ['.claude/commands/1_gofer_research.md', '# Local stale research command\n'],
      ['.github/prompts/gofer.prompt.md', '# Local stale Gofer prompt\n'],
      ['.github/prompts/1_gofer_research.prompt.md', '# Local stale research prompt\n'],
      ['.agents/skills/gofer/SKILL.md', '# Local stale Gofer skill\n'],
      ['.system/skills/1_gofer_research/SKILL.md', '# Local stale research skill\n'],
      ['.gemini/commands/gofer/gofer.toml', 'prompt = "{{include: ./gofer.md}}"\n'],
      ['.gemini/commands/gofer/1_gofer_research.md', '# Local stale Gemini command\n'],
    ]);

    for (const [relativePath, content] of staleFiles) {
      const filePath = path.join(workspaceRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    const bootstrap = runJson(BOOTSTRAP_SCRIPT, [
      '--workspace',
      workspaceRoot,
      '--host',
      'claude',
      '--include-mirrors',
    ]);
    expect(bootstrap.exitCode).toBe(0);

    for (const relativePath of staleFiles.keys()) {
      expect(fs.existsSync(path.join(workspaceRoot, relativePath)), relativePath).toBe(false);
    }
    expect(fs.existsSync(path.join(workspaceRoot, '.claude/commands/eai.md'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, '.agents/skills/eai/SKILL.md'))).toBe(true);

    const archiveRoot = path.join(workspaceRoot, '.specify', 'logs', 'legacy-command-backups');
    const archivedFiles = findFiles(archiveRoot);
    for (const relativePath of staleFiles.keys()) {
      const archived = archivedFiles.find((filePath) => filePath.endsWith(relativePath));
      expect(archived, `${relativePath} should be archived`).toBeTruthy();
    }
  });

  it('can include host app mirror resources for Claude, Codex, Copilot, and Gemini', () => {
    const bootstrap = runJson(BOOTSTRAP_SCRIPT, [
      '--workspace',
      workspaceRoot,
      '--host',
      'claude',
      '--include-mirrors',
    ]);
    expect(bootstrap.exitCode).toBe(0);

    for (const relativePath of [
      '.claude/skills/eai/SKILL.md',
      '.github/agents/gofer-business.agent.md',
      '.github/skills/eai/SKILL.md',
      '.agents/skills/eai/SKILL.md',
      '.gemini/extension.json',
    ]) {
      expect(
        fs.existsSync(path.join(workspaceRoot, relativePath)),
        `${relativePath} should exist`
      ).toBe(true);
    }
  });
});
