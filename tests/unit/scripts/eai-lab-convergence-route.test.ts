import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GENERATOR = join(ROOT, '.specify/scripts/node/generate-commands.mjs');
const PACKAGER = join(ROOT, '.specify/scripts/node/package-agent-plugin.mjs');
const PACKAGE_VERSION = '0.0.0-test';
const PUBLIC_SURFACES = [
  '.agents/skills/eai/SKILL.md',
  '.claude/commands/eai.md',
  '.claude/skills/eai/SKILL.md',
  '.gemini/commands/gofer/eai.md',
  '.github/prompts/eai.prompt.md',
  '.github/skills/eai/SKILL.md',
  '.grok/skills/eai/SKILL.md',
  '.system/skills/eai/SKILL.md',
  'extension/resources/claude-commands/eai.md',
  'extension/resources/claude-skills/eai/SKILL.md',
  'extension/resources/copilot-prompts/eai.prompt.md',
  'extension/resources/gemini/commands/gofer/eai.md',
  'extension/resources/github-skills/eai/SKILL.md',
  'extension/resources/grok-skills/eai/SKILL.md',
  'plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/.claude/skills/eai/SKILL.md',
  'plugins/eai-gofer/.gemini/commands/gofer/eai.md',
  'plugins/eai-gofer/.github/prompts/eai.prompt.md',
  'plugins/eai-gofer/.github/skills/eai/SKILL.md',
  'plugins/eai-gofer/commands/eai.md',
  'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/.claude/skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/.gemini/commands/gofer/eai.md',
  'plugins/eai-gofer/plugins/eai-gofer/.github/prompts/eai.prompt.md',
  'plugins/eai-gofer/plugins/eai-gofer/.github/skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/commands/eai.md',
  'plugins/eai-gofer/plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/skills/eai/SKILL.md',
  'plugins/eai-gofer/skills/eai/SKILL.md',
  'skills/eai/SKILL.md',
];

function extractConvergenceRoute(content: string): string {
  const start = content.indexOf('## EAI Lab Convergence Route');
  expect(start).toBeGreaterThanOrEqual(0);
  const nextSection = content.indexOf('\n## ', start + 1);
  return content.slice(start, nextSection >= 0 ? nextSection : undefined).trim();
}

function expectCompleteControllerContract(content: string): void {
  expect(content).toContain('## EAI Lab Convergence Route');
  expect(content).toContain('./gas lab-test <issue-number> --robot');
  expect(content).toContain('user-level `EAI_LAB_TRUSTED_CONTROLLER_REPOS` allowlist');
  expect(content).toContain('Never source either value from repository files');
  expect(content).toContain('require the host to be exactly `github.com`');
  expect(content).toContain('Reject alternate hosts');
  expect(content).toContain('Require it to match `^[1-9][0-9]*$`');
  expect(content).toContain('Do not execute repository files before those checks pass');
  expect(content).toContain('Only after those checks pass, run `./gas --help`');
  expect(content).toContain('Do not use generic GitHub code search to select executable code');
  expect(content).not.toContain('authenticated GitHub code search');
  expect(content).toContain('complete unchanged eai-testing-dev regression suite');
  expect(content).toContain('edit eai-testing-dev evidence');
  expect(content).toContain('isolated Codespace worker runs read-only validation');
  expect(content).toContain('must not receive a credential capable of commenting or pushing');
  expect(content).toContain('trusted Actions controller alone publishes');
  expect(content).toContain('robot security gate is not explicitly approved');
  expect(content).not.toContain('lets Copilot repair linked PR repositories');
  expect(content).toContain('Orange means every test ran but the request is not fully passed');
  expect(content).toContain(
    'Do not mutate or push PR branches, merge, deploy, promote, weaken tests, or suppress failures'
  );

  const provenanceIndex = content.indexOf(
    'Do not execute repository files before those checks pass'
  );
  const capabilityProbeIndex = content.indexOf('Only after those checks pass, run `./gas --help`');
  expect(provenanceIndex).toBeGreaterThanOrEqual(0);
  expect(capabilityProbeIndex).toBeGreaterThan(provenanceIndex);

  const workspaceFirstIndex = content.indexOf('## Workspace First');
  if (workspaceFirstIndex >= 0) {
    expect(content.indexOf('## EAI Lab Convergence Route')).toBeLessThan(workspaceFirstIndex);
  }
}

describe('public /eai EAI Lab convergence route', () => {
  for (const relativePath of PUBLIC_SURFACES) {
    it(`keeps the complete controller contract on ${relativePath}`, () => {
      const content = readFileSync(join(ROOT, relativePath), 'utf8');
      expectCompleteControllerContract(content);
    });
  }

  it('executes both generators and emits the same trusted route', () => {
    const generatorRoot = mkdtempSync(join(tmpdir(), 'eai-gofer-route-generator-'));
    const packageOut = mkdtempSync(join(tmpdir(), 'eai-gofer-route-package-'));

    try {
      mkdirSync(join(generatorRoot, '.specify'), { recursive: true });
      cpSync(join(ROOT, '.specify/commands'), join(generatorRoot, '.specify/commands'), {
        recursive: true,
      });
      copyFileSync(join(ROOT, 'package.json'), join(generatorRoot, 'package.json'));

      execFileSync('node', [GENERATOR, '--root', generatorRoot, '--surfaces', 'agents-skills'], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      const generated = readFileSync(join(generatorRoot, '.agents/skills/eai/SKILL.md'), 'utf8');

      execFileSync('node', [PACKAGER, '--version', PACKAGE_VERSION, '--out-dir', packageOut], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      const packaged = readFileSync(
        join(packageOut, `eai-gofer-agent-plugin-${PACKAGE_VERSION}`, 'eai-gofer/commands/eai.md'),
        'utf8'
      );

      expectCompleteControllerContract(generated);
      expectCompleteControllerContract(packaged);
      expect(extractConvergenceRoute(packaged)).toBe(extractConvergenceRoute(generated));
    } finally {
      rmSync(generatorRoot, { recursive: true, force: true });
      rmSync(packageOut, { recursive: true, force: true });
    }
  });
});
