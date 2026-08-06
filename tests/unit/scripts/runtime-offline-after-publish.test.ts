/**
 * T170 — Verifies the published plugin/extension/agent bundle works fully
 * offline. The four shipped manifests + scripts must contain no runtime fetch
 * or network calls. URLs in comments / documentation are tolerated.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const MANIFEST_FILES = [
  path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'),
  path.join(REPO_ROOT, '.codex-plugin', 'plugin.json'),
  path.join(REPO_ROOT, '.github', 'plugin', 'marketplace.json'),
  path.join(REPO_ROOT, '.gemini', 'extension.json'),
  path.join(REPO_ROOT, 'plugin.json'),
  path.join(REPO_ROOT, 'AGENTS.md'),
  path.join(REPO_ROOT, 'codex-config.toml'),
];

const REFERENCED_SCRIPTS = [
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'generate-commands.mjs'),
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'codex-doctor.mjs'),
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'mermaid-export.mjs'),
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'parse-stage-command.mjs'),
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'canonical-descriptions.mjs'),
  path.join(REPO_ROOT, '.specify', 'scripts', 'node', 'package-agent-plugin.mjs'),
];

const ALLOWED_URL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'github.com',
  'eai-support.github.io',
  'enterpriseai.com.au',
  'anthropic.com',
  'www.anthropic.com',
  'developers.openai.com',
]);

function stripHtmlComments(content: string): string {
  let output = '';
  let index = 0;

  while (index < content.length) {
    const start = content.indexOf('<!--', index);
    if (start === -1) {
      output += content.slice(index);
      break;
    }

    output += content.slice(index, start);
    const end = content.indexOf('-->', start + 4);
    index = end === -1 ? content.length : end + 3;
  }

  return output;
}

function stripComments(content: string, ext: string): string {
  if (ext === '.json') {
    // JSON has no comments.
    return content;
  }
  if (ext === '.toml' || ext === '.md') {
    // Strip toml `#` and markdown content treating `<!-- -->` as comment.
    const withoutTomlComments = content
      .split('\n')
      .map((line) => {
        if (ext === '.toml' && line.trim().startsWith('#')) return '';
        return line;
      })
      .join('\n');
    return stripHtmlComments(withoutTomlComments);
  }
  if (ext === '.mjs' || ext === '.js' || ext === '.ts') {
    // Strip block comments and line comments
    return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }
  return content;
}

describe('runtime offline after publish (T170)', () => {
  it('manifest files exist', (): void => {
    for (const file of MANIFEST_FILES) {
      expect(fs.existsSync(file), `${file} missing`).toBe(true);
    }
  });

  it('manifests contain no live URLs to runtime services', (): void => {
    for (const file of MANIFEST_FILES) {
      const ext = path.extname(file);
      const raw = fs.readFileSync(file, 'utf8');
      const stripped = stripComments(raw, ext);
      // Find any http(s) URLs — tolerate localhost, repo refs, github.com,
      // anthropic.com, and developers.openai.com when they appear strictly in
      // comments (already stripped above). Any remaining URL is suspect.
      const urls = stripped.match(/https?:\/\/[^\s"')]+/g) || [];
      const liveUrls = urls.filter((u) => {
        // Allow well-known doc/host URLs even outside comments — they're
        // descriptive text, not runtime endpoints.
        try {
          return !ALLOWED_URL_HOSTS.has(new URL(u).hostname);
        } catch {
          return true;
        }
      });
      expect(liveUrls, `${file} contains live runtime URL(s): ${liveUrls.join(', ')}`).toEqual([]);
    }
  });

  it('referenced scripts make no runtime network calls (no fetch/http/https imports)', (): void => {
    for (const script of REFERENCED_SCRIPTS) {
      if (!fs.existsSync(script)) continue;
      const raw = fs.readFileSync(script, 'utf8');
      const stripped = stripComments(raw, path.extname(script));
      // Forbid: `fetch(`, `import('http')`, `require('http')`, `from 'http'`, etc.
      const forbidden: RegExp[] = [
        /\bfetch\s*\(/,
        /from\s+['"]node:?https?['"]/,
        /from\s+['"]node:?http['"]/,
        /require\s*\(\s*['"]node:?https?['"]/,
        /require\s*\(\s*['"]node:?http['"]/,
        /import\s*\(\s*['"]node:?https?['"]/,
      ];
      for (const re of forbidden) {
        expect(re.test(stripped), `${script} appears to make a network call: matches ${re}`).toBe(
          false
        );
      }
    }
  });

  it('plugin/extension can be installed without network — no install hooks reference network', (): void => {
    // The Claude plugin and Gemini extension are pure declarative manifests,
    // so this is mostly an extension of the URL check. We assert that neither
    // manifest declares an `install` or `postInstall` script.
    const claudeManifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    expect(claudeManifest.install).toBeUndefined();
    expect(claudeManifest.postInstall).toBeUndefined();

    const geminiManifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, '.gemini', 'extension.json'), 'utf8')
    );
    expect(geminiManifest.install).toBeUndefined();
    expect(geminiManifest.postInstall).toBeUndefined();
  });
});
