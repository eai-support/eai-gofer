/**
 * T162 — End-to-end test for Gemini extension shape.
 *
 * Verifies:
 *   1. .gemini/extension.json exists and is valid JSON
 *   2. .gemini/commands/gofer/ contains TOML files
 *   3. Each TOML file has `description = "..."` and a prompt field
 *   4. Number of TOML files = the public Gofer entrypoint set
 *   5. Internal stage/helper contracts stay under .specify/commands/
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FULL_COMMAND_FILES,
  PUBLIC_ENTRYPOINT_COUNT,
  PUBLIC_ENTRYPOINT_FILES,
} from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const GEMINI_EXTENSION_JSON = path.join(REPO_ROOT, '.gemini', 'extension.json');
const GEMINI_COMMANDS_DIR = path.join(REPO_ROOT, '.gemini', 'commands', 'gofer');
const ROOT_PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

describe('e2e gemini extension shape (T162)', () => {
  it('.gemini/extension.json exists', (): void => {
    expect(fs.existsSync(GEMINI_EXTENSION_JSON)).toBe(true);
  });

  it('.gemini/extension.json is valid JSON', (): void => {
    const content = fs.readFileSync(GEMINI_EXTENSION_JSON, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('.gemini/extension.json has required top-level fields', (): void => {
    const manifest = JSON.parse(fs.readFileSync(GEMINI_EXTENSION_JSON, 'utf8'));
    const rootPackage = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, 'utf8'));
    expect(manifest.name).toBe('eai-gofer');
    expect(manifest.version).toBe(rootPackage.version);
    expect(typeof manifest.description).toBe('string');
    expect(typeof manifest.commands).toBe('string');
  });

  it('.gemini/commands/gofer/ exists and contains TOML files', (): void => {
    expect(fs.existsSync(GEMINI_COMMANDS_DIR)).toBe(true);
    const tomlFiles = fs.readdirSync(GEMINI_COMMANDS_DIR).filter((f) => f.endsWith('.toml'));
    expect(tomlFiles.length).toBeGreaterThan(0);
  });

  it('every TOML file declares description and prompt', (): void => {
    const tomlFiles = fs.readdirSync(GEMINI_COMMANDS_DIR).filter((f) => f.endsWith('.toml'));
    for (const file of tomlFiles) {
      const content = fs.readFileSync(path.join(GEMINI_COMMANDS_DIR, file), 'utf8');
      expect(content, `${file} missing description`).toMatch(/^description\s*=\s*"/m);
      expect(content, `${file} missing prompt`).toMatch(/^prompt\s*=/m);
    }
  });

  it(`emits exactly ${PUBLIC_ENTRYPOINT_COUNT} TOML files for the public command set`, (): void => {
    const tomlFiles = fs.readdirSync(GEMINI_COMMANDS_DIR).filter((f) => f.endsWith('.toml'));
    expect(tomlFiles.length).toBe(PUBLIC_ENTRYPOINT_COUNT);
    expect(tomlFiles.sort()).toEqual(PUBLIC_ENTRYPOINT_FILES.map((file) => `${file}.toml`).sort());
  });

  it('internal stage/helper contracts stay under .specify/commands/', (): void => {
    for (const stage of FULL_COMMAND_FILES) {
      const tomlPath = path.join(GEMINI_COMMANDS_DIR, `${stage}.toml`);
      expect(fs.existsSync(tomlPath), `stage '${stage}' should not be public Gemini command`).toBe(
        false
      );
      expect(fs.existsSync(path.join(REPO_ROOT, '.specify', 'commands', `${stage}.md`))).toBe(true);
    }
  });
});
