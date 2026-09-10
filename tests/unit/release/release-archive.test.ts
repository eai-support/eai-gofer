import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const sourceScript = path.resolve(__dirname, '../../../scripts/create-release-archive.sh');

describe('deterministic release archive', () => {
  let root: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-release-archive-'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(sourceScript, path.join(root, 'scripts', 'create-release-archive.sh'));
    fs.chmodSync(path.join(root, 'scripts', 'create-release-archive.sh'), 0o755);
    for (const directory of [
      'dist',
      'extension/dist',
      'language-server/dist',
      'docs-site/static/releases',
    ]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'dist', 'index.js'), 'orchestrator');
    fs.writeFileSync(path.join(root, 'dist', 'eai-gofer-agent-plugin-3.4.0.zip'), 'ephemeral');
    fs.mkdirSync(path.join(root, 'dist', 'eai-gofer-agent-plugin-3.4.0'));
    fs.writeFileSync(
      path.join(root, 'dist', 'eai-gofer-agent-plugin-3.4.0', 'ephemeral.txt'),
      'ephemeral'
    );
    fs.writeFileSync(path.join(root, 'extension', 'dist', 'extension.js'), 'extension');
    fs.writeFileSync(path.join(root, 'language-server', 'dist', 'server.js'), 'server');
    fs.writeFileSync(
      path.join(root, 'docs-site', 'static', 'releases', 'eai-gofer-3.4.0.vsix'),
      'committed vsix'
    );
    fs.writeFileSync(
      path.join(root, 'docs-site', 'static', 'releases', 'eai-gofer-agent-plugin-3.4.0.zip'),
      'committed plugin'
    );
    for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
      fs.writeFileSync(path.join(root, file), file);
    }
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'release@example.invalid'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Release Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: root });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('produces identical bytes despite source mtime changes and excludes ephemeral plugin builds', async () => {
    const script = path.join(root, 'scripts', 'create-release-archive.sh');
    await execFileAsync('bash', [script, '3.4.0', 'v3.4.0', 'first.tar.gz'], { cwd: root });
    const future = new Date(Date.now() + 60_000);
    for (const file of [
      'dist/index.js',
      'extension/dist/extension.js',
      'language-server/dist/server.js',
    ]) {
      fs.utimesSync(path.join(root, file), future, future);
    }
    await execFileAsync('bash', [script, '3.4.0', 'v3.4.0', 'second.tar.gz'], { cwd: root });

    expect(fs.readFileSync(path.join(root, 'second.tar.gz'))).toEqual(
      fs.readFileSync(path.join(root, 'first.tar.gz'))
    );
    const { stdout } = await execFileAsync('tar', ['-tzf', 'first.tar.gz'], { cwd: root });
    expect(stdout).not.toContain('eai-gofer-agent-plugin-3.4.0/ephemeral.txt');
    expect(stdout).not.toContain('orchestrator/eai-gofer-agent-plugin-3.4.0.zip');
  });
});
