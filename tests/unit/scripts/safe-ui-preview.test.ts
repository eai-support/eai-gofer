import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const preview = await import(
  new URL('../../../.specify/scripts/node/gofer-ui-preview.mjs', import.meta.url).href
);
const directories: string[] = [];
const servers: http.Server[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-safe-preview-'));
  directories.push(dir);
  return dir;
};
async function listen(status = 200) {
  const server = http.createServer((_req, res) => {
    res.writeHead(status);
    res.end('<html><body>Test app</body></html>');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}`, port: address.port };
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('safe app preview and truthful readiness', () => {
  it('does not scan unrelated app ports when a target is selected', () => {
    expect(preview.buildCandidateUrls({ command: './run.sh dev 3101' })).toEqual([
      'http://localhost:3101',
    ]);
    expect(preview.buildCandidateUrls()).toEqual(['http://localhost:3001']);
  });

  it.each([301, 302, 401, 403, 404, 500])(
    'does not accept HTTP %s as a working preview',
    async (status) => {
      const { url } = await listen(status);
      expect((await preview.waitForReachableUrl([url], 30, 10)).ok).toBe(false);
    }
  );

  it('records HTTP success as reachable only', async () => {
    const { url } = await listen();
    expect((await preview.waitForReachableUrl([url], 200, 50)).ok).toBe(true);
    const report = await preview.runUiPreview(
      preview.parseArgs([
        '--workspace',
        temp(),
        '--url',
        url,
        '--no-open',
        '--no-screenshot',
        '--skip-scenarios',
      ])
    );
    expect(report.status).toBe('unverified');
    expect(report.readyToShow).toBe(false);
    expect(report.businessScenarios.run.status).toBe('skipped');
    expect(JSON.parse(fs.readFileSync(report.businessScenarios.reportPath, 'utf8')).status).toBe(
      'skipped'
    );
  });

  it('does not call a runner or stop the listener when the port is occupied', async () => {
    const { url, port } = await listen();
    const workspace = temp();
    const report = await preview.runUiPreview(
      preview.parseArgs([
        '--workspace',
        workspace,
        '--command',
        `node definitely-not-a-runner.js --port ${port}`,
        '--no-open',
        '--skip-scenarios',
      ])
    );
    expect(report.status).toBe('blocked');
    expect(report.server).toBeNull();
    expect(report.readyToShow).toBe(false);
    expect(fs.existsSync(path.join(workspace, '.specify/logs/ui-preview/preview-server.pid'))).toBe(
      false
    );
    expect((await fetch(url)).status).toBe(200);
  });

  it('never reports a dry run as ready', async () => {
    const report = await preview.runUiPreview(
      preview.parseArgs([
        '--workspace',
        temp(),
        '--url',
        'http://localhost:3001',
        '--dry-run',
        '--skip-scenarios',
      ])
    );
    expect(report.status).toBe('planned');
    expect(report.readyToShow).toBe(false);
  });

  it('starts its own short-lived app on a free port without calling it verified', async () => {
    const reservation = await listen();
    const reservedServer = servers.pop()!;
    await new Promise<void>((resolve) => reservedServer.close(() => resolve()));
    const workspace = temp();
    fs.writeFileSync(
      path.join(workspace, 'preview-fixture.cjs'),
      `
const http=require('node:http');
const server=http.createServer((req,res)=>{res.end('<html><body>Fixture app</body></html>');});
server.listen(${reservation.port}, '127.0.0.1');
setTimeout(()=>{server.closeAllConnections();server.close(()=>process.exit(0));},2500);
`
    );
    try {
      const report = await preview.runUiPreview(
        preview.parseArgs([
          '--workspace',
          workspace,
          '--command',
          `node preview-fixture.cjs --port ${reservation.port}`,
          '--timeout-ms',
          '1500',
          '--no-open',
          '--no-screenshot',
          '--skip-scenarios',
        ])
      );
      expect(report.server.pid).toBeGreaterThan(0);
      expect(report.status).toBe('unverified');
      expect(report.readyToShow).toBe(false);
      expect(report.selectedUrl).toBe(`http://localhost:${reservation.port}`);
    } finally {
      // The fixture owns its lifetime; do not kill by port or by a reused PID.
      await new Promise((resolve) => setTimeout(resolve, 2800));
    }
  });

  it.each(['http-error', 'empty', 'script-error', 'wrong-app', 'good'])(
    'checks the browser result: %s',
    async (mode) => {
      const screenshot = vi.fn();
      const close = vi.fn();
      const page = {
        on: (_name: string, callback: () => void) => {
          if (mode === 'script-error') callback();
        },
        goto: async () => ({ ok: () => mode !== 'http-error' }),
        url: () => (mode === 'wrong-app' ? 'http://localhost:4000' : 'http://localhost:3001'),
        locator: () => ({ innerText: async () => (mode === 'empty' ? '  ' : 'App content') }),
        screenshot,
      };
      const engine = {
        launch: async () => ({ newPage: async () => page, close: async () => close() }),
      };
      const result = await preview.captureScreenshot(
        'http://localhost:3001',
        path.join(temp(), 'preview.png'),
        engine
      );
      expect(result.ok).toBe(mode === 'good');
      expect(screenshot).toHaveBeenCalledTimes(mode === 'good' ? 1 : 0);
      expect(close).toHaveBeenCalledOnce();
    }
  );
});
