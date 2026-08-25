import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const previewModuleUrl = new URL(
  '../../../.specify/scripts/node/gofer-ui-preview.mjs',
  import.meta.url
);

describe('gofer UI preview runner discovery', () => {
  it('prefers the repo runner over generic package preview scripts', async () => {
    const { discoverPreviewCommand, buildCandidateUrls } = await import(previewModuleUrl.href);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-ui-preview-'));

    try {
      fs.writeFileSync(
        path.join(workspace, 'package.json'),
        JSON.stringify({ scripts: { dev: 'next dev' } }, null, 2)
      );
      fs.writeFileSync(path.join(workspace, 'run.sh'), '#!/usr/bin/env bash\n');

      const command = await discoverPreviewCommand(workspace);
      expect(command).toEqual({
        command: './run.sh dev 3001',
        source: 'repo-runner',
        packageManager: null,
        scriptName: null,
      });
      expect(buildCandidateUrls({ command: command.command })[0]).toBe('http://localhost:3001');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('selects the Windows runner when running on Windows', async () => {
    const { discoverRepoRunnerCommand } = await import(previewModuleUrl.href);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-ui-preview-win-'));

    try {
      fs.writeFileSync(path.join(workspace, 'run.bat'), '@echo off\n');
      const command = await discoverRepoRunnerCommand(workspace, 3001, 'win32');
      expect(command.command).toBe('run.bat dev 3001');
      expect(command.source).toBe('repo-runner');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
