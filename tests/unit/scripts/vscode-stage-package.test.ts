import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
// @ts-expect-error Local ESM script deliberately exposes its pure validation function.
import { runtimeFiles, verifyStagePackage } from '../../../scripts/verify-vscode-stage-package.mjs';

function fixture() {
  const manifest = {
    name: 'gofer',
    publisher: 'EnterpriseAI',
    version: '3.12.4',
    contributes: {
      languageModelTools: ['gofer_discover_models', 'gofer_execute_stage'].map((name) => ({
        name,
      })),
    },
  };
  const files: Record<string, Buffer> = Object.fromEntries(
    runtimeFiles.map((file: string) => [file, Buffer.from('source')])
  );
  files['dist/extension.js'] = Buffer.from('gofer_discover_models gofer_execute_stage');
  files['resources/copilot-prompts/eai.prompt.md'] = Buffer.from(
    '---\nagent: agent\n---\ngofer_discover_models'
  );
  const packaged = { ...files, 'package.json': Buffer.from(JSON.stringify(manifest)) };
  const read = (file: string) => {
    if (!packaged[file]) throw new Error('missing');
    return packaged[file];
  };
  return { manifest, files, packaged, read };
}

function releaseSteps(): Array<{
  name: string;
  run?: string;
  'working-directory'?: string;
  'continue-on-error'?: boolean;
  if?: string;
  with?: { files?: string };
}> {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/release.yml', import.meta.url),
    'utf8'
  );
  return matter(`---\n${workflow}\n---`).data.jobs.release.steps;
}

describe('built VSIX and installed native tool contract', () => {
  it('verifies byte identity, without claiming activation', () => {
    const f = fixture();
    expect(verifyStagePackage(f.read, f)).toMatchObject({
      status: 'PASS',
      provesActivation: false,
    });
  });
  it.each(['gofer_discover_models', 'gofer_execute_stage'])(
    'rejects same-version package missing %s',
    (name) => {
      const f = fixture();
      const manifest = structuredClone(f.manifest);
      manifest.contributes.languageModelTools = manifest.contributes.languageModelTools.filter(
        (t) => t.name !== name
      );
      f.packaged['package.json'] = Buffer.from(JSON.stringify(manifest));
      expect(() => verifyStagePackage(f.read, f)).toThrow('Missing or stale native tool');
    }
  );
  it.each(runtimeFiles)('rejects stale packaged %s', (file: string) => {
    const f = fixture();
    f.packaged[file] = Buffer.from('stale');
    expect(() => verifyStagePackage(f.read, f)).toThrow('Missing or stale runtime');
  });
  it('rejects uncompiled sources even if package matches the stale build', () => {
    const f = fixture();
    f.files['dist/extension.js'] = f.packaged['dist/extension.js'] =
      Buffer.from('old compiled source');
    expect(() => verifyStagePackage(f.read, f)).toThrow('compiled code');
  });
  it('rejects the foreign prompt allowlist', () => {
    const f = fixture();
    const file = 'resources/copilot-prompts/eai.prompt.md';
    f.files[file] = f.packaged[file] = Buffer.from(
      '---\ntools: [Read, Bash]\n---\ngofer_discover_models'
    );
    expect(() => verifyStagePackage(f.read, f)).toThrow('prompt');
  });
  it('runs before release distribution', () => {
    const release = readFileSync(new URL('../../../release.sh', import.meta.url), 'utf8');
    expect(release).toContain('if ! node scripts/verify-vscode-stage-package.mjs --vsix');
    expect(release.indexOf('if ! node scripts/verify-vscode-stage-package.mjs')).toBeLessThan(
      release.indexOf('print_info "Packaging Claude/Codex/Copilot agent plugin..."')
    );
  });
  it('checks the freshly built GitHub release VSIX before archiving or publishing it', () => {
    const steps = releaseSteps();
    const filename = 'eai-gofer-${{ steps.version.outputs.version }}.vsix';
    const vsix = `extension/${filename}`;
    const names = [
      'Build Components',
      'Package VS Code Extension',
      'Verify Packaged VS Code Stage Tools',
      'Create Release Archive',
      'Publish GitHub Release',
      'Publish VS Code Marketplace Extension',
    ];
    const indices = names.map((name) => {
      expect(
        steps.filter((step) => step.name === name),
        name
      ).toHaveLength(1);
      return steps.findIndex((step) => step.name === name);
    });
    for (let index = 1; index < indices.length; index++) {
      expect(indices[index], names[index]).toBeGreaterThan(indices[index - 1]);
    }
    expect(steps[indices[1]]).toMatchObject({
      'working-directory': './extension',
      run: `npx @vscode/vsce package --out "${filename}"`,
    });
    expect(steps[indices[2]]).toMatchObject({
      'working-directory': '.',
      run: `node scripts/verify-vscode-stage-package.mjs --vsix "${vsix}"`,
    });
    expect(steps[indices[3]].run).toContain(`cp "${vsix}" release-assets/`);
    expect(steps[indices[4]].with?.files?.split('\n')).toContain(vsix);
    expect(steps[indices[5]].run).toContain(`--packagePath "${filename}"`);
  });
  it('makes VSIX verification mandatory and prevents publication after its failure', () => {
    const steps = releaseSteps();
    for (const name of [
      'Verify Packaged VS Code Stage Tools',
      'Create Release Archive',
      'Publish GitHub Release',
      'Publish VS Code Marketplace Extension',
    ]) {
      const step = steps.find((candidate) => candidate.name === name);
      expect(step, name).toBeDefined();
      expect(step?.if, name).toBeUndefined();
      expect(step?.['continue-on-error'], name).toBeUndefined();
    }
  });
});
