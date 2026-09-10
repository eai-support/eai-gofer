import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSelectedSemanticHostStatus,
  resolveSemanticHostEvidence,
  type SemanticHostEvidenceProbes,
} from '../../../extension/src/services/SemanticHostEvidence';

function createProbes(
  overrides: Partial<SemanticHostEvidenceProbes> = {}
): SemanticHostEvidenceProbes {
  return {
    detectVersion: vi.fn().mockResolvedValue(null),
    supportsSubcommand: vi.fn().mockResolvedValue(false),
    extensionInstalled: vi.fn().mockReturnValue(false),
    isVSCodeExtensionHost: false,
    isValidResource: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

describe('semantic host status evidence', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps a selected host unverified when no executable or resource exists', async () => {
    const probes = createProbes();

    const evidence = await resolveSemanticHostEvidence('grok', '/workspace', probes);
    expect(evidence).toEqual({
      verified: false,
      sources: [],
    });
    expect(buildSelectedSemanticHostStatus('grok', evidence)).toEqual({
      icon: '$(warning)',
      text: 'Grok Build',
      tooltip:
        'Grok Build selected via gofer.defaultCLI, but its executable or workspace resource has not been verified.',
    });
    expect(probes.detectVersion).toHaveBeenCalledWith('grok');
  });

  it('verifies Grok from its exact workspace skill and avoids a redundant process probe', async () => {
    const probes = createProbes({
      isValidResource: vi.fn((filePath: string) => filePath.endsWith('/.grok/skills/eai/SKILL.md')),
    });

    await expect(resolveSemanticHostEvidence('grok', '/workspace', probes)).resolves.toEqual({
      verified: true,
      sources: ['Grok skill resource'],
    });
    expect(
      buildSelectedSemanticHostStatus('grok', {
        verified: true,
        sources: ['Grok skill resource'],
      })
    ).toMatchObject({
      icon: '$(check)',
      text: 'Grok Build',
      tooltip: expect.stringContaining('verified via Grok skill resource'),
    });
    expect(probes.detectVersion).not.toHaveBeenCalled();
  });

  it('verifies Antigravity from the repository GEMINI.md bridge', async () => {
    const probes = createProbes({
      isValidResource: vi.fn((filePath: string) => filePath.endsWith('/GEMINI.md')),
    });

    const result = await resolveSemanticHostEvidence('antigravity', '/workspace', probes);

    expect(result).toEqual({
      verified: true,
      sources: ['Antigravity instruction resource'],
    });
  });

  it('does not treat Copilot selection as proof but accepts installed extension evidence', async () => {
    const absent = createProbes();
    expect((await resolveSemanticHostEvidence('copilot', '/workspace', absent)).verified).toBe(
      false
    );

    const installed = createProbes({
      extensionInstalled: vi.fn((extensionId: string) => extensionId === 'GitHub.copilot'),
    });
    await expect(resolveSemanticHostEvidence('copilot', '/workspace', installed)).resolves.toEqual({
      verified: true,
      sources: ['GitHub Copilot extension'],
    });
  });

  it('uses the active VS Code execution context as concrete VS Code evidence', async () => {
    const probes = createProbes({ isVSCodeExtensionHost: true });

    await expect(resolveSemanticHostEvidence('vscode', '/workspace', probes)).resolves.toEqual({
      verified: true,
      sources: ['VS Code extension host'],
    });
  });

  it('does not accept an empty or malformed workspace file as provider evidence', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-host-evidence-'));
    temporaryDirectories.push(workspace);
    const skillPath = path.join(workspace, '.grok', 'skills', 'eai', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, 'not a Gofer skill\n', 'utf8');

    const probes = createProbes({ isValidResource: undefined });
    expect((await resolveSemanticHostEvidence('grok', workspace, probes)).verified).toBe(false);

    fs.writeFileSync(
      skillPath,
      '---\nname: eai\ndescription: test\n---\n\n# Eai\n\nHost: Grok Build\n',
      'utf8'
    );
    await expect(resolveSemanticHostEvidence('grok', workspace, probes)).resolves.toEqual({
      verified: true,
      sources: ['Grok skill resource'],
    });
  });
});
