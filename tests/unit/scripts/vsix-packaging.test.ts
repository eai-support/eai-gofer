/**
 * T172 — Validates that the published VSIX includes the persona-pack templates
 * and source-of-truth command bodies (mirrored to extension/resources/).
 *
 *   1. extension/.vscodeignore does NOT exclude resources/templates/visuals/**
 *   2. extension/.vscodeignore does NOT exclude resources/claude-commands/**
 *   3. extension/.vscodeignore does NOT exclude resources/specify-commands/**
 *   4. extension/resources/templates/visuals/ contains persona-pack templates
 *   5. extension/resources/claude-commands/ contains the public Claude wrappers
 *   6. extension/resources/specify-commands/ contains canonical source files
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');
const VSCODEIGNORE = path.join(EXTENSION_DIR, '.vscodeignore');

describe('vsix packaging includes persona-pack + source-of-truth (T172)', () => {
  it('extension/.vscodeignore exists', (): void => {
    expect(fs.existsSync(VSCODEIGNORE)).toBe(true);
  });

  it('does NOT exclude resources/templates/visuals/**', (): void => {
    const content = fs.readFileSync(VSCODEIGNORE, 'utf8');
    // Either no rule mentions visuals, OR there is a `!` re-include rule.
    const hasNegativeRule = /(^|\n)!resources\/templates\/visuals\//.test(content);
    const hasExclusion = /(^|\n)resources\/templates\/visuals\//.test(content) && !hasNegativeRule;
    expect(
      hasExclusion,
      `.vscodeignore excludes resources/templates/visuals/** without re-include`
    ).toBe(false);
  });

  it('does NOT exclude resources/claude-commands/**', (): void => {
    const content = fs.readFileSync(VSCODEIGNORE, 'utf8');
    const hasNegativeRule = /(^|\n)!resources\/claude-commands\//.test(content);
    const hasExclusion = /(^|\n)resources\/claude-commands\//.test(content) && !hasNegativeRule;
    expect(hasExclusion).toBe(false);
  });

  it('does NOT exclude resources/specify-commands/**', (): void => {
    const content = fs.readFileSync(VSCODEIGNORE, 'utf8');
    const hasNegativeRule = /(^|\n)!resources\/specify-commands\//.test(content);
    const hasExclusion = /(^|\n)resources\/specify-commands\//.test(content) && !hasNegativeRule;
    expect(hasExclusion).toBe(false);
  });

  it('extension/resources/templates/visuals/ exists with persona-pack files', (): void => {
    const visualsDir = path.join(EXTENSION_DIR, 'resources', 'templates', 'visuals');
    expect(fs.existsSync(visualsDir)).toBe(true);
    const files = fs.readdirSync(visualsDir).filter((f) => f.endsWith('.md'));
    // At least the 9 persona-pack visuals (impact-canvas, value-stream-asis/tobe,
    // c4-context, c4-container, capability-heatmap, bounded-context-map, erd,
    // risk-heatmap) plus templates.
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it('extension/resources/claude-commands/ contains public Claude wrappers', (): void => {
    const claudeDir = path.join(EXTENSION_DIR, 'resources', 'claude-commands');
    expect(fs.existsSync(claudeDir)).toBe(true);
    const files = fs.readdirSync(claudeDir).filter((f) => f.endsWith('.md'));
    expect(files.sort()).toEqual(['eai.md']);
  });

  it('extension/resources/specify-commands/ contains canonical command sources', (): void => {
    const specifyCommandsDir = path.join(EXTENSION_DIR, 'resources', 'specify-commands');
    expect(fs.existsSync(specifyCommandsDir)).toBe(true);
    expect(fs.existsSync(path.join(specifyCommandsDir, '6_gofer_validate.md'))).toBe(true);
    expect(fs.existsSync(path.join(specifyCommandsDir, 'gofer_diagnose.md'))).toBe(true);
  });
});
