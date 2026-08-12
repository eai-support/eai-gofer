#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === scriptPath
  : false;

export const EAI_REFRESH_OVERLAY_MAPPINGS = [
  ['.specify/config', 'config'],
  ['.specify/contracts', 'contracts'],
  ['.specify/commands', 'commands'],
  ['.specify/memory', 'memory'],
  ['.specify/references', 'references'],
  ['.specify/schemas', 'schemas'],
  ['.system/skills', 'system-skills'],
  ['.agents/skills', 'agents-skills'],
];

export const EAI_REQUIRED_RESOURCE_DIRECTORIES = [
  'config',
  'contracts',
  'commands',
  'templates',
  'references',
  'schemas',
  'bash-scripts',
  'powershell-scripts',
  'node-scripts',
  'hook-scripts',
  'claude-commands',
  'claude-agents',
  'copilot-prompts',
  'copilot-instructions',
  'system-skills',
  'agents-skills',
  'gemini',
];

async function isDirectory(targetPath) {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function directoryContainsFile(targetPath) {
  if (!(await isDirectory(targetPath))) return false;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && await directoryContainsFile(path.join(targetPath, entry.name))) {
      return true;
    }
  }
  return false;
}

async function copyDirectoryIfPresent(source, target) {
  if (!(await isDirectory(source))) return;
  await fs.mkdir(target, { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
}

export async function buildEaiRefreshLayout(repoRoot, targetRoot) {
  const baseResources = path.join(repoRoot, 'extension', 'resources');
  if (!(await isDirectory(baseResources))) {
    throw new Error('Gofer release is missing extension/resources');
  }

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });
  await fs.cp(baseResources, targetRoot, { recursive: true, force: true });
  for (const [sourceRelative, targetRelative] of EAI_REFRESH_OVERLAY_MAPPINGS) {
    await copyDirectoryIfPresent(
      path.join(repoRoot, sourceRelative),
      path.join(targetRoot, targetRelative),
    );
  }

  const checks = await Promise.all(
    EAI_REQUIRED_RESOURCE_DIRECTORIES.map(async (directory) => ({
      directory,
      present: await directoryContainsFile(path.join(targetRoot, directory)),
    })),
  );
  const missing = checks.filter((check) => !check.present).map((check) => check.directory);
  if (missing.length > 0) {
    throw new Error(
      `Gofer cannot produce the normalized eai refresh layout; missing required directories: ${missing.join(', ')}`,
    );
  }
}

export async function verifyEaiRefreshLayout(repoRoot = defaultRepoRoot) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-eai-refresh-layout-'));
  try {
    await buildEaiRefreshLayout(repoRoot, path.join(workspace, 'resources'));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

if (isDirectRun) {
  verifyEaiRefreshLayout()
    .then(() => console.log('EAI Gofer refresh layout is complete'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
