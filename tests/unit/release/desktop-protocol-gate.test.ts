import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const { load } = createRequire(import.meta.url)('js-yaml');
type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = {
  uses?: string;
  needs?: string[];
  if?: string;
  with?: Record<string, unknown>;
  permissions?: Record<string, string>;
  strategy?: { matrix: { os: string[] } };
  steps?: Step[];
};
const workflow = (name: string) => load(read(`.github/workflows/${name}.yml`)) as {
  on: Record<string, { inputs?: Record<string, { required?: boolean; type: string }> }>;
  jobs: Record<string, Job>;
};

describe('desktop protocol release gate', () => {
  it('builds and tests real processes rather than reusing unit-test results', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    expect(scripts['test:mcp-protocol']).toBe(
      'npm --prefix language-server run build && node scripts/test-mcp-protocol.mjs'
    );
  });

  it('blocks release before packaging when protocol validation fails', () => {
    const script = read('release.sh');
    const check = 'run_release_check "Gofer real MCP and LSP protocol tests" npm run test:mcp-protocol';
    expect(script).toContain(check);
    expect(script.indexOf(check)).toBeLessThan(
      script.indexOf('run_release_check "VS Code production package build"')
    );
    expect(script).not.toContain(`${check} || true`);
  });

  it('checks Linux, macOS and Windows in CI without continue-on-error', () => {
    const workflow = read('.github/workflows/desktop-contracts.yml');
    for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
      expect(workflow).toContain(os);
    }
    expect(workflow).toContain('run: npm run test:mcp-protocol');
    expect(workflow).not.toContain('continue-on-error');
  });

  it('tests the actual package before local or GitHub publication', () => {
    const release = read('release.sh');
    expect(release).toContain('run_release_check "Packaged Gofer MCP and LSP protocol tests"');
    expect(release).toContain('npm run test:packaged-protocol -- --vsix');
    const workflow = read('.github/workflows/release.yml');
    expect(workflow).toContain('run: npm run test:mcp-protocol');
    expect(workflow).toContain('run: npm run test:packaged-protocol -- --vsix');
    expect(workflow.indexOf('name: Test packaged MCP and LSP runtime')).toBeLessThan(
      workflow.indexOf('name: Create Release Archive')
    );
    expect(workflow).toContain('node scripts/test-mcp-protocol.mjs --runtime-root');
  });

  it.each(['release', 'pages'])('requires exact-SHA desktop checks before %s publication', (name) => {
    const jobs = workflow(name).jobs;
    const gate = jobs['desktop-contracts'];
    expect(gate.uses).toBe('./.github/workflows/desktop-contracts.yml');
    expect(gate.with?.['source-sha']).toBe('${{ github.sha }}');
    expect(gate.permissions).toEqual({ contents: 'read' });
    expect(gate.if).toBeUndefined();
    const publisher = jobs[name === 'release' ? 'release' : 'deploy'];
    expect(publisher.needs).toContain('desktop-contracts');
    expect(publisher.if).toBeUndefined();
    expect(publisher.steps?.find(step => step.uses === 'actions/checkout@v6')?.with?.ref).toBe('${{ github.sha }}');
  });

  it('preserves standalone CI and pins both reusable jobs to the caller commit', () => {
    const contracts = workflow('desktop-contracts');
    expect(contracts.on).toHaveProperty('pull_request');
    expect(contracts.on).toHaveProperty('push');
    expect(contracts.on.workflow_call.inputs?.['source-sha']).toEqual(expect.objectContaining({ required: true, type: 'string' }));
    expect(contracts.jobs.protocol.strategy?.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    for (const name of ['protocol', 'packaged-runtime']) {
      const steps = contracts.jobs[name].steps!;
      expect(steps.find(step => step.uses === 'actions/checkout@v6')?.with?.ref).toBe('${{ inputs.source-sha || github.sha }}');
      const verify = steps.find(step => step.name === 'Verify exact checkout');
      expect(verify?.env?.EXPECTED_SHA).toBe('${{ inputs.source-sha || github.sha }}');
      expect(verify?.run).toBe('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"');
    }
  });

  it('tests the committed public VSIX, not only a rebuilt package, for every Pages deployment', () => {
    expect(workflow('pages').jobs['desktop-contracts'].with?.['verify-public-assets']).toBe(true);
    const step = workflow('desktop-contracts').jobs['packaged-runtime'].steps?.find(
      entry => entry.name === 'Test committed public runtime before Pages promotion'
    );
    expect(step?.if).toBe('inputs.verify-public-assets');
    expect(step?.run).toBe('npm run test:packaged-protocol -- --vsix docs-site/static/releases/eai-gofer-latest.vsix');
  });

  it('includes locked production dependencies and checks the extracted archive before publication', () => {
    const steps = workflow('release').jobs.release.steps!;
    const archive = steps.find(step => step.name === 'Create Release Archive')?.run;
    expect(archive).toContain('cp package.json package-lock.json release-assets/orchestrator/');
    expect(archive).toContain('(cd release-assets/orchestrator && npm ci --omit=dev --ignore-scripts)');
    expect(archive).toContain('cp -R dist release-assets/orchestrator/dist');
    const check = steps.find(step => step.name === 'Test extracted archive runtimes')!;
    expect(check.run).toContain('tar -xzf "$RELEASE_ARCHIVE" -C "$archive_test"');
    expect(check.run).toContain('realpathSync(process.env.ARCHIVE_TEST_ROOT)');
    expect(check.run).toContain("path.join(root, 'empty-workspace')");
    expect(check.run).toContain('SPEC_DIR: specs, WORKSPACE_DIR: workspace');
    expect(check.run).toContain("['NODE_PATH', 'NODE_OPTIONS']");
    expect(check.run).toContain("path.join(runtime, 'dist', 'index.js')");
    expect(check.run).toContain('timeout: 15000');
    expect(check.run).toContain('orchestrator_stopped');
    expect(check.run).toContain("'--runtime-root', path.join(root, 'release-assets', 'language-server')");
    expect(steps.indexOf(check)).toBeLessThan(steps.findIndex(step => step.name === 'Publish GitHub Release'));
  });

  for (const pipefail of [false, true]) {
    it.each([[0, 0], [7, 0], [0, 9], [7, 9]])(
      `preserves command/log failure status with pipefail=${pipefail}: command=%i log=%i`,
      (commandStatus, logStatus) => {
        const release = read('release.sh');
        const helper = release.slice(release.indexOf('run_logged_release_check() {'), release.indexOf('install_release_dependencies() {'));
        expect(helper).toContain('PIPESTATUS');
        expect(release).toContain('run_logged_release_check "Extension command validation" /tmp/command-test.log ./test-commands.sh');
        const result = spawnSync('bash', ['-c', `
          set -e
          ${pipefail ? 'set -o pipefail' : 'set +o pipefail'}
          print_success() { printf '%s\\n' "$1"; }
          fail_release_validation() { printf '%s\\n' "$1"; exit 91; }
          tee() { cat; return "$LOG_STATUS"; }
          ${helper}
          run_logged_release_check fixture unused bash -c 'exit "$COMMAND_STATUS"'
          printf 'NEXT_RELEASE_STEP\\n'
        `], { encoding: 'utf8', timeout: 10000, env: { ...process.env, COMMAND_STATUS: String(commandStatus), LOG_STATUS: String(logStatus) } });
        expect(result.error).toBeUndefined();
        const success = commandStatus === 0 && logStatus === 0;
        expect(result.status).toBe(success ? 0 : 91);
        expect(result.stdout.includes('NEXT_RELEASE_STEP')).toBe(success);
        if (!success) expect(result.stdout).toContain(`command=${commandStatus}, log=${logStatus}`);
      }
    );
  }
});
