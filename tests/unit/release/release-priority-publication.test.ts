import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const release = readFileSync(new URL('../../../release.sh', import.meta.url), 'utf8');
const functions = release.slice(
  release.indexOf('ensure_release_base() {'),
  release.indexOf('load_env_file() {')
);
let dir: string;
let workspace: string;
let remote: string;
let env: NodeJS.ProcessEnv;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function check(expected: string, command = 'ensure_publication_head "$EXPECTED_HEAD"') {
  return spawnSync(
    'bash',
    [
      '-c',
      `
    set -e
    print_info() { printf '%s\\n' "$1"; }
    print_error() { printf '%s\\n' "$1" >&2; }
    repo_has_changes() { [ -n "$(git status --porcelain)" ]; }
    CURRENT_BRANCH=$(git branch --show-current)
    ${functions}
    ${command}
    printf 'NEXT_RELEASE_STEP\\n'
  `,
    ],
    {
      cwd: workspace,
      env: { ...env, EXPECTED_HEAD: expected },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
}

function advanceRemote() {
  const peer = path.join(dir, 'peer');
  git(dir, 'clone', remote, peer);
  git(peer, 'commit', '--allow-empty', '-m', 'remote advance');
  git(peer, 'push', 'origin', 'main');
  return git(peer, 'rev-parse', 'HEAD');
}

function expectBlocked(result: ReturnType<typeof check>) {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).not.toContain('NEXT_RELEASE_STEP');
  expect(result.stderr).toContain('No release tag was created.');
  expect(git(workspace, 'tag', '--list')).toBe('');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'gofer-publication-'));
  workspace = path.join(dir, 'workspace');
  remote = path.join(dir, 'origin.git');
  env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(dir, 'no-global-config'),
    GIT_AUTHOR_NAME: 'Release Test',
    GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
    GIT_COMMITTER_NAME: 'Release Test',
    GIT_COMMITTER_EMAIL: 'release-test@example.invalid',
    GIT_TERMINAL_PROMPT: '0',
  };
  git(dir, 'init', '--bare', '--initial-branch=main', remote);
  git(dir, 'init', '--initial-branch=main', workspace);
  git(workspace, 'commit', '--allow-empty', '-m', 'initial main');
  git(workspace, 'remote', 'add', 'origin', remote);
  git(workspace, 'push', '-u', 'origin', 'main');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('release publication commit safeguard', () => {
  it('allows the exact fetched main commit', () => {
    const head = git(workspace, 'rev-parse', 'HEAD');
    const result = check(head);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NEXT_RELEASE_STEP');
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('rejects unmerged local release-preparation commits', () => {
    git(workspace, 'commit', '--allow-empty', '-m', 'unmerged release preparation');
    const head = git(workspace, 'rev-parse', 'HEAD');
    expectBlocked(check(head));
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('fetches again and rejects main advancing during validation without moving HEAD', () => {
    const head = git(workspace, 'rev-parse', 'HEAD');
    expect(check(head).status).toBe(0);
    const remoteHead = advanceRemote();
    expect(git(workspace, 'rev-parse', 'origin/main')).toBe(head);
    expectBlocked(check(head));
    expect(git(workspace, 'rev-parse', 'origin/main')).toBe(remoteHead);
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('rejects divergent main', () => {
    git(workspace, 'commit', '--allow-empty', '-m', 'local advance');
    advanceRemote();
    expectBlocked(check(git(workspace, 'rev-parse', 'HEAD')));
  });

  it('rejects a changed local commit even when it now matches remote main', () => {
    const validated = git(workspace, 'rev-parse', 'HEAD');
    advanceRemote();
    git(workspace, 'pull', '--ff-only', 'origin', 'main');
    expectBlocked(check(validated));
  });

  it('fails closed when fetch fails despite a matching cached origin/main', () => {
    const head = git(workspace, 'rev-parse', 'HEAD');
    git(workspace, 'remote', 'set-url', 'origin', path.join(dir, 'missing.git'));
    expectBlocked(check(head));
  });

  it.each(['branch', 'detached'])('rejects a %s checkout even at the same commit', (kind) => {
    const head = git(workspace, 'rev-parse', 'HEAD');
    if (kind === 'branch') git(workspace, 'checkout', '-b', 'release/preparation');
    else git(workspace, 'checkout', '--detach');
    expectBlocked(check(head));
  });

  it('preserves safe fast-forwarding in the normal preparation flow', () => {
    const remoteHead = advanceRemote();
    expect(check(remoteHead, 'ensure_release_base').status).toBe(0);
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(remoteHead);
    expect(check(remoteHead).status).toBe(0);
  });

  it('keeps the preparation ancestry rule separate from the stricter publication rule', () => {
    git(workspace, 'commit', '--allow-empty', '-m', 'local preparation');
    const head = git(workspace, 'rev-parse', 'HEAD');
    expect(check(head, 'ensure_release_base').status).toBe(0);
    expectBlocked(check(head));
  });

  it('checks before validation and immediately before tagging the validated commit', () => {
    const publication = release.slice(
      release.indexOf('if [ "$RELEASE_PHASE" = "publish" ]; then'),
      release.indexOf('# Calculate new version')
    );
    const guard = 'ensure_publication_head "$PUBLICATION_HEAD"';
    const validation = publication.indexOf('run_release_validation_gate "$CURRENT_VERSION"');
    const packaged = publication.indexOf('run_release_check "Merged Gofer release artifact"');
    const tag = publication.indexOf('git tag "$TAG_NAME" "$PUBLICATION_HEAD"');
    expect(publication.match(/ensure_publication_head "\$PUBLICATION_HEAD"/g)).toHaveLength(2);
    expect(publication.indexOf('PUBLICATION_HEAD=$(git rev-parse --verify HEAD)')).toBeLessThan(
      publication.indexOf(guard)
    );
    expect(publication.indexOf(guard)).toBeLessThan(validation);
    expect(validation).toBeLessThan(packaged);
    expect(packaged).toBeLessThan(publication.lastIndexOf(guard));
    expect(publication.lastIndexOf(guard)).toBeLessThan(tag);
    expect(tag).toBeLessThan(publication.indexOf('git push --no-verify origin "$TAG_NAME"'));
    expect(publication).not.toContain(`${guard} ||`);
    expect(release.slice(release.indexOf('# Calculate new version'))).not.toContain(guard);
  });
});
