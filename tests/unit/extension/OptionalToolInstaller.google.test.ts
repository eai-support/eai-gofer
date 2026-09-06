import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import {
  OptionalToolInstaller,
  type OptionalToolId,
} from '../../../extension/src/services/OptionalToolInstaller';
import { ProjectDetector } from '../../../extension/src/services/ProjectDetector';
import { Logger } from '../../../extension/src/services/Logger';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('../../../extension/src/services/ProjectDetector', () => ({
  ProjectDetector: { detect: vi.fn() },
}));

describe('Optional Google tool detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(vscode.window, { createTerminal: vi.fn() });
    vi.mocked(ProjectDetector.detect).mockResolvedValue(
      {} as Awaited<ReturnType<typeof ProjectDetector.detect>>
    );
  });

  it('uses only a bounded agy version probe; no desktop inference or Gemini installer', async () => {
    vi.mocked(execFile).mockImplementation(((_command, _args, _options, callback) => {
      callback(null, 'version', '');
    }) as typeof execFile);
    const before = process.env.AGY_CLI_DISABLE_AUTO_UPDATE;
    const tools = await new OptionalToolInstaller(new Logger()).getRecommendations(
      '/missing-fixture'
    );
    expect(execFile).toHaveBeenCalledWith(
      'agy',
      ['--version'],
      expect.objectContaining({
        shell: false,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        env: expect.objectContaining({ AGY_CLI_DISABLE_AUTO_UPDATE: 'true' }),
      }),
      expect.any(Function)
    );
    expect(process.env.AGY_CLI_DISABLE_AUTO_UPDATE).toBe(before);
    expect(tools.find((t) => t.id === 'antigravity')).toMatchObject({
      installed: true,
      installSupported: false,
      recommended: false,
      verification: 'version-only',
    });
    expect(tools.find((t) => t.id === 'antigravity-desktop')).toMatchObject({
      installed: false,
      installSupported: false,
      recommended: false,
      verification: 'unverified',
    });
    expect(tools.some((t) => String(t.id) === 'gemini')).toBe(false);
    expect(vi.mocked(execFile).mock.calls.map((call) => call[0])).toEqual([
      'claude',
      'codex',
      'agy',
      'gh',
      'az',
    ]);
  });

  it.each(['ENOENT', 'EACCES', 'ETIMEDOUT'])('does not mark agy installed on %s', async (code) => {
    vi.mocked(execFile).mockImplementation(((_command, _args, _options, callback) => {
      callback(Object.assign(new Error(code), { code }), '', '');
    }) as typeof execFile);
    const tools = await new OptionalToolInstaller(new Logger()).getRecommendations(
      '/missing-fixture'
    );
    expect(tools.find((t) => t.id === 'antigravity')?.installed).toBe(false);
  });

  it.each(['gemini', 'antigravity', 'antigravity-desktop'])(
    'blocks %s even when mixed with a supported installer, before launching anything',
    async (surface) => {
      await expect(
        new OptionalToolInstaller(new Logger()).runInstaller('/missing-fixture', [
          'claude',
          surface as OptionalToolId,
        ])
      ).rejects.toThrow(/retired|not verified/);
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
      expect(execFile).not.toHaveBeenCalled();
    }
  );
});
