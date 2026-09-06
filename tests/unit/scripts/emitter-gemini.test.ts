import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FULL_COMMAND_COUNT } from '../../helpers/goferCommandSet';

const root = path.resolve(__dirname, '../../..');
const generatorUrl = new URL(
  '../../../.specify/scripts/node/generate-commands.mjs',
  import.meta.url
);
const parserUrl = new URL(
  '../../../.specify/scripts/node/parse-stage-command.mjs',
  import.meta.url
);

describe('Gemini CLI retirement and shared Antigravity renderer', () => {
  let generator: typeof import('../../../.specify/scripts/node/generate-commands.mjs');
  let stages: { filePath: string; frontmatter: Record<string, unknown>; body: string }[];

  beforeAll(async () => {
    generator = await import(generatorUrl.href);
    const { parseStageCommand } = await import(parserUrl.href);
    stages = [];
    for (const name of (await fs.readdir(path.join(root, '.specify/commands'))).filter((f) =>
      f.endsWith('.md')
    )) {
      const filePath = path.join(root, '.specify/commands', name);
      stages.push({ filePath, ...(await parseStageCommand(filePath)) });
    }
  });

  it('removes Gemini from default generation without losing other emitters', () => {
    expect(generator.resolveGenerationSurfaces()).toEqual([
      'claude',
      'claude-mirror',
      'claude-skills',
      'copilot',
      'github-prompts',
      'github-agents',
      'github-skills',
      'agents-skills',
      'system-skills',
      'grok-skills',
      'agents-md',
      'codex-config',
    ]);
  });

  it('rejects explicit Gemini generation, including mixed requests, before writes', () => {
    for (const surfaces of [['gemini'], ['claude', 'gemini']]) {
      expect(() => generator.resolveGenerationSurfaces(surfaces)).toThrow(
        /Gemini CLI is retired.*Antigravity/
      );
    }
    expect(() => generator.resolveGenerationSurfaces(['unknown'])).toThrow(/Unsupported/);
  });

  it('deduplicates CLI, desktop, and Codex onto the same skill output', () => {
    expect(
      generator.resolveGenerationSurfaces(['antigravity', 'agents-skills', 'antigravity-desktop'])
    ).toEqual(['agents-skills']);
  });

  it.each(['eai', 'eai-update'])(
    'renders %s with explicit current-host selection, not Codex impersonation',
    (name) => {
      const content = generator.buildPublicEntrypointSkill(
        { name, title: name, description: 'Test entrypoint.' },
        '1.0.0',
        stages,
        'Codex / Antigravity CLI / Antigravity desktop',
        'portable'
      );
      expect(content).toContain('`codex`, `antigravity`, or `antigravity-desktop`');
      expect(content).toContain('Never execute an unresolved placeholder');
      expect(content).toContain('--host <host>');
      expect(content).not.toContain('--host portable');
      expect(content).not.toContain('--host codex');
      expect(content).not.toContain('--host gemini');
      expect(content).toContain('Keep `GEMINI.md` and `AGENTS.md`');
      expect(content).toContain('do not prove native skill discovery or model execution');
      expect(content).not.toContain('gemini extensions');
    }
  );

  it('keeps all 26 internal contracts and safety gates in the shared entrypoint', () => {
    expect(stages).toHaveLength(26);
    expect(stages).toHaveLength(FULL_COMMAND_COUNT);
    const content = generator.buildPublicEntrypointSkill(
      { name: 'eai', title: 'Eai', description: 'Test.' },
      '1.0.0',
      stages,
      'Shared',
      'portable'
    );
    for (const stage of stages) {
      expect(stage.frontmatter.surfaces).toContain('antigravity');
      expect(stage.frontmatter.surfaces).not.toContain('gemini');
      expect(content).toContain('`' + path.basename(stage.filePath, '.md') + '`');
    }
    for (const gate of [
      '## User-Facing Response Gate',
      '## EAI Platform Readiness',
      '## App vs Non-App Routing',
      '6_gofer_validate',
      'Initialize/update it now?',
    ]) {
      expect(content).toContain(gate);
    }
    expect(content).toContain('.specify/commands/*.md');
  });
});
