import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const preview = import(
  new URL('../../.specify/scripts/node/gofer-ui-preview.mjs', import.meta.url).href
);
const require = createRequire(import.meta.url);

for (const mode of ['good', 'http-error', 'script-error', 'empty']) {
  test(`real browser preview: ${mode}`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-browser-proof-'));
    const server = http.createServer((_req, res) => {
      res.writeHead(mode === 'http-error' ? 404 : 200, { 'content-type': 'text/html' });
      res.end(
        mode === 'empty'
          ? '<html><body></body></html>'
          : `<html><body>Local preview${mode === 'script-error' ? '<script>throw new Error("fixture failure")</script>' : ''}</body></html>`
      );
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as { port: number };
      const result = await (
        await preview
      ).captureScreenshot(`http://127.0.0.1:${port}`, path.join(dir, 'preview.png'));
      expect(result.ok).toBe(mode === 'good');
      expect(fs.existsSync(path.join(dir, 'preview.png'))).toBe(mode === 'good');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('ready-to-show requires a real local browser journey; opening is reported separately', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-verified-preview-'));
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      "<html><body><button onclick=\"document.querySelector('p').textContent='Saved'\">Save</button><p>Draft</p></body></html>"
    );
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;
    fs.writeFileSync(
      path.join(dir, 'playwright-journey.cjs'),
      `
const {chromium}=require(${JSON.stringify(require.resolve('playwright'))});
(async()=>{ const browser=await chromium.launch(); try {
const page=await browser.newPage(); await page.goto(${JSON.stringify(url)});
await page.getByRole('button',{name:'Save'}).click();
if(await page.locator('p').innerText()!=='Saved') throw new Error('Save failed');
} finally {await browser.close();} })().catch(()=>{process.exitCode=1;});
`
    );
    fs.writeFileSync(
      path.join(dir, 'business-scenarios.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        command: 'node playwright-journey.cjs',
        scenarios: [
          {
            id: 'save',
            userStory: 'Save a draft',
            screens: ['Draft'],
            testFiles: ['playwright-journey.cjs'],
          },
        ],
      })
    );
    const module = await preview;
    const report = await module.runUiPreview(
      module.parseArgs(['--workspace', dir, '--feature-dir', dir, '--url', url, '--no-open'])
    );
    expect(report.status).toBe('verified');
    expect(report.readyToShow).toBe(true);
    expect(report.browser.attempted).toBe(false);
    expect(report.businessScenarios.run.status).toBe('passed');
    expect(fs.existsSync(report.screenshot.path)).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
