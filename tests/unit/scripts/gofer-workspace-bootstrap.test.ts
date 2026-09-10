import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HOST_POLICIES,
  WORKSPACE_HOSTS,
  normalizeHost,
} from '../../../.specify/scripts/node/workspace-bootstrap-lib.mjs';

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

function runRaw(scriptPath: string, args: string[]) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
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

  it('uses exactly six current semantic hosts and maps legacy Gemini to Antigravity', () => {
    expect(WORKSPACE_HOSTS).toEqual([
      'claude',
      'codex',
      'copilot',
      'antigravity',
      'grok',
      'vscode',
    ]);
    expect(Object.keys(HOST_POLICIES)).toEqual(['auto', ...WORKSPACE_HOSTS]);
    expect(normalizeHost()).toBe('auto');
    expect(normalizeHost('')).toBe('auto');
    expect(normalizeHost('   ')).toBe('auto');
    expect(normalizeHost('gemini')).toBe('antigravity');
    expect(() => normalizeHost('grokk')).toThrow(/Unsupported Gofer host/);
  });

  it('keeps omitted and blank hosts as auto but rejects invalid explicit hosts without mutation', () => {
    for (const args of [
      ['--workspace', workspaceRoot, '--json'],
      ['--workspace', workspaceRoot, '--host', '', '--json'],
    ]) {
      const result = runJson(CHECK_SCRIPT, args);
      expect(result.exitCode).toBe(2);
      expect(result.payload.host).toBe('auto');
    }

    for (const script of [CHECK_SCRIPT, BOOTSTRAP_SCRIPT]) {
      const result = runRaw(script, ['--workspace', workspaceRoot, '--host', 'grokk', '--json']);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Unsupported Gofer host');
      expect(result.stderr).not.toContain('grokk');
      expect(fs.existsSync(path.join(workspaceRoot, '.specify'))).toBe(false);
    }
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
      '.specify/scripts/node/gofer-local-settings-cleanup.mjs',
      '.specify/scripts/node/gofer-loop-audit.mjs',
      '.specify/scripts/node/gofer-ui-preview.mjs',
      '.specify/scripts/hooks/post-tool-use.mjs',
      '.specify/scripts/powershell/install-optional-tools.ps1',
      '.specify/README.md',
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      '.claude/settings.json',
      '.github/copilot-instructions.md',
      '.gitignore',
    ]) {
      expect(
        fs.existsSync(path.join(workspaceRoot, relativePath)),
        `${relativePath} should exist`
      ).toBe(true);
    }

    expect(fs.existsSync(path.join(workspaceRoot, '.claude', 'commands'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills'))).toBe(false);

    const agents = fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('## User-Facing Response Gate');
    expect(agents).toContain('If any check fails, rewrite the reply before sending it');
    expect(agents).toContain('gofer:always-on-eai:start');
    expect(agents).toContain(
      '`/eai` in Claude, Copilot, Antigravity, Grok, or VS Code, and `$eai` in Codex'
    );
    expect(agents).not.toContain('#eai');
    expect(fs.readFileSync(path.join(workspaceRoot, 'GEMINI.md'), 'utf8')).toContain(
      'gofer:always-on-eai:start'
    );

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

    const legacyGeminiPost = runJson(CHECK_SCRIPT, [
      '--workspace',
      workspaceRoot,
      '--host',
      'gemini',
      '--json',
    ]);
    expect(legacyGeminiPost.exitCode).toBe(0);
    expect(legacyGeminiPost.payload.host).toBe('antigravity');
    expect(legacyGeminiPost.payload.status).toBe('healthy');
  });

  it('preserves existing instruction files and adds only the managed always-on section', () => {
    const customAgents = '# custom agents\n';
    const customClaude = `# custom claude

## Always-On EAI Contract

Legacy Gofer instructions.

## Personal Rules

Keep this instruction.
`;
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

    const agents = fs.readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
    const claude = fs.readFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'utf8');
    expect(agents).toContain(customAgents.trim());
    expect(claude).toContain('# custom claude');
    expect(agents).toContain('gofer:always-on-eai:start');
    expect(claude).toContain('gofer:always-on-eai:start');
    expect(claude.match(/## Always-On EAI Contract/g) || []).toHaveLength(1);
    expect(claude).not.toContain('Legacy Gofer instructions.');
    expect(claude).toContain('## Personal Rules');
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

  it('can include current host mirrors and legacy Gemini file-format resources', () => {
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
      '.grok/skills/eai/SKILL.md',
      '.gemini/extension.json',
    ]) {
      expect(
        fs.existsSync(path.join(workspaceRoot, relativePath)),
        `${relativePath} should exist`
      ).toBe(true);
    }
  });

  it.each([
    {
      label: 'top-level managed directory',
      includeMirrors: false,
      prepare(outsideRoot: string) {
        fs.symlinkSync(
          outsideRoot,
          path.join(workspaceRoot, '.specify'),
          process.platform === 'win32' ? 'junction' : 'dir'
        );
      },
    },
    {
      label: 'nested managed directory',
      includeMirrors: false,
      prepare(outsideRoot: string) {
        fs.mkdirSync(path.join(workspaceRoot, '.specify'));
        fs.symlinkSync(
          outsideRoot,
          path.join(workspaceRoot, '.specify', 'scripts'),
          process.platform === 'win32' ? 'junction' : 'dir'
        );
      },
    },
    {
      label: 'managed file leaf',
      includeMirrors: false,
      prepare(outsideRoot: string) {
        const outsideFile = path.join(outsideRoot, 'version.txt');
        fs.writeFileSync(outsideFile, 'outside-content\n');
        fs.mkdirSync(path.join(workspaceRoot, '.specify'));
        fs.symlinkSync(outsideFile, path.join(workspaceRoot, '.specify', '.gofer-version'));
      },
    },
    {
      label: 'legacy archive directory',
      includeMirrors: false,
      prepare(outsideRoot: string) {
        fs.mkdirSync(path.join(workspaceRoot, '.specify', 'logs'), { recursive: true });
        fs.mkdirSync(path.join(workspaceRoot, '.specify', 'commands'), { recursive: true });
        fs.writeFileSync(
          path.join(workspaceRoot, '.specify', 'commands', '0_business_scenario.md'),
          '# legacy\n'
        );
        fs.symlinkSync(
          outsideRoot,
          path.join(workspaceRoot, '.specify', 'logs', 'legacy-command-backups'),
          process.platform === 'win32' ? 'junction' : 'dir'
        );
      },
    },
    {
      label: 'nested host mirror directory',
      includeMirrors: true,
      prepare(outsideRoot: string) {
        fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
        fs.symlinkSync(
          outsideRoot,
          path.join(workspaceRoot, '.github', 'prompts'),
          process.platform === 'win32' ? 'junction' : 'dir'
        );
      },
    },
  ])('rejects a $label symlink without writing through it', ({ prepare, includeMirrors }) => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-bootstrap-outside-'));
    try {
      prepare(outsideRoot);
      const before = findFiles(outsideRoot).map((filePath) => ({
        relativePath: path.relative(outsideRoot, filePath),
        content: fs.readFileSync(filePath, 'utf8'),
      }));

      const args = ['--workspace', workspaceRoot, '--host', 'claude'];
      if (includeMirrors) {
        args.push('--include-mirrors');
      }
      const result = runRaw(BOOTSTRAP_SCRIPT, args);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Unsafe Gofer workspace path.*symbolic link/i);
      expect(
        findFiles(outsideRoot).map((filePath) => ({
          relativePath: path.relative(outsideRoot, filePath),
          content: fs.readFileSync(filePath, 'utf8'),
        }))
      ).toEqual(before);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects non-directory managed parent components', () => {
    fs.writeFileSync(path.join(workspaceRoot, '.specify'), 'not a directory\n');

    const result = runRaw(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/managed directory component must be a real directory/i);
  });

  it('rejects a workspace root presented through a symbolic link', () => {
    const aliasContainer = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-bootstrap-alias-'));
    const workspaceAlias = path.join(aliasContainer, 'workspace');
    try {
      fs.symlinkSync(
        workspaceRoot,
        workspaceAlias,
        process.platform === 'win32' ? 'junction' : 'dir'
      );

      const result = runRaw(BOOTSTRAP_SCRIPT, ['--workspace', workspaceAlias, '--host', 'claude']);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/workspace root must be a real directory.*symbolic link/i);
      expect(fs.existsSync(path.join(workspaceRoot, '.specify'))).toBe(false);
    } finally {
      fs.rmSync(aliasContainer, { recursive: true, force: true });
    }
  });

  it('rejects a legacy archive source symlink without changing its target', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-bootstrap-outside-'));
    const outsideFile = path.join(outsideRoot, 'legacy.md');
    const legacyPath = path.join(workspaceRoot, '.specify', 'commands', '0_business_scenario.md');
    try {
      fs.writeFileSync(outsideFile, '# outside legacy\n');
      fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
      fs.symlinkSync(outsideFile, legacyPath);

      const result = runRaw(BOOTSTRAP_SCRIPT, ['--workspace', workspaceRoot, '--host', 'claude']);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Unsafe Gofer workspace path.*symbolic link/i);
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('# outside legacy\n');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
