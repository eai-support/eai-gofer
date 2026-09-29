#!/usr/bin/env node

import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { reviewPriority } from './gofer-priority-check.mjs';
import { runSemanticReview } from './gofer-semantic-drift.mjs';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_CONTEXT_FILE_BYTES = 16 * 1024;
const PLACEHOLDER_MARKERS = [
  '[FEATURE NAME]',
  '[###-feature-name]',
  '[specific capability',
  '[domain-specific',
  '[REMOVE IF UNUSED]',
  'ACTION REQUIRED',
  'NEEDS CLARIFICATION',
];

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoSymlinkPath(root, target) {
  const relative = path.relative(root, target);
  if (!isInside(root, target)) throw new Error('Feature or context path must remain inside its workspace.');
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await lstat(current).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error('Feature and context paths must not pass through symbolic links.');
  }
}

async function safeFile(root, target, limit = MAX_DOCUMENT_BYTES) {
  await assertNoSymlinkPath(root, target);
  const info = await lstat(target);
  if (!info.isFile() || info.size > limit) throw new Error('A required feature file is missing, not regular, or too large.');
  return readFile(target, 'utf8');
}

function hasTemplateMarker(content) {
  return PLACEHOLDER_MARKERS.some((marker) => content.includes(marker));
}

function parseArgs(argv) {
  const options = { workspace: process.cwd(), featureDir: '', task: '', changedFiles: [], jevChatReadiness: false, chatContextFile: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--workspace') options.workspace = argv[++index] || '';
    else if (flag === '--feature-dir') options.featureDir = argv[++index] || '';
    else if (flag === '--task') options.task = argv[++index] || '';
    else if (flag === '--changed-file') options.changedFiles.push(argv[++index] || '');
    else if (flag === '--jev-chat-readiness') options.jevChatReadiness = true;
    else if (flag === '--chat-context-file') options.chatContextFile = argv[++index] || '';
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!options.workspace || !options.featureDir || !options.task || !options.changedFiles.length) {
    throw new Error('--workspace, --feature-dir, --task, and at least one --changed-file are required.');
  }
  if (options.jevChatReadiness !== Boolean(options.chatContextFile)) {
    throw new Error('--jev-chat-readiness requires --chat-context-file, and the context file is only valid with that option.');
  }
  return options;
}

export async function checkPreEdit(options, { semanticReview = runSemanticReview } = {}) {
  const workspace = await realpath(path.resolve(options.workspace));
  const featureDir = path.resolve(workspace, options.featureDir);
  await assertNoSymlinkPath(workspace, featureDir);
  const featureInfo = await lstat(featureDir).catch(() => null);
  if (!featureInfo?.isDirectory()) return { status: 'blocked', findings: ['FEATURE_DIRECTORY_MISSING'] };

  const findings = [];
  const contents = {};
  for (const file of ['goal-ledger.json', 'spec.md', 'plan.md', 'tasks.md']) {
    try {
      contents[file] = await safeFile(workspace, path.join(featureDir, file));
      if (!contents[file].trim()) findings.push(`EMPTY_FILE:${file}`);
      else if (hasTemplateMarker(contents[file])) findings.push(`TEMPLATE_FILE:${file}`);
    } catch (error) {
      findings.push(error?.code === 'ENOENT' ? `MISSING_FILE:${file}` : `INVALID_FILE:${file}`);
    }
  }
  try {
    const ledger = JSON.parse(contents['goal-ledger.json'] || 'null');
    if (!Array.isArray(ledger?.goals) || ledger.goals.length === 0 || !ledger.goals.some((goal) => typeof goal.goal === 'string' && goal.goal.trim())) {
      findings.push('GOAL_LEDGER_HAS_NO_GOAL');
    }
  } catch { findings.push('GOAL_LEDGER_INVALID'); }

  if (findings.length) return { status: 'blocked', findings, task: options.task };

  const priority = await reviewPriority(featureDir, {
    task: options.task,
    changedFiles: options.changedFiles,
    workspaceRoot: workspace,
  });
  if (priority.status !== 'pass') {
    return { status: 'blocked', findings: priority.findings, task: options.task, nextTask: priority.nextTask };
  }

  if (!options.jevChatReadiness) {
    return { status: 'ready', findings: [], task: options.task, jev: { selected: false } };
  }

  const contextFile = options.chatContextFile;
  if (path.isAbsolute(contextFile) || contextFile.split(/[\\/]/).some((part) => part === '..' || part === '.')) {
    return { status: 'blocked', findings: ['CHAT_CONTEXT_PATH_INVALID'], task: options.task };
  }
  const contextPath = path.resolve(featureDir, contextFile);
  let contextInfo;
  try {
    await assertNoSymlinkPath(featureDir, contextPath);
    contextInfo = await lstat(contextPath);
  } catch {
    return { status: 'blocked', findings: ['CHAT_CONTEXT_FILE_MISSING_OR_INVALID'], task: options.task };
  }
  if (!contextInfo.isFile()) return { status: 'blocked', findings: ['CHAT_CONTEXT_FILE_MISSING_OR_INVALID'], task: options.task };
  if (contextInfo.size > MAX_CONTEXT_FILE_BYTES) {
    return {
      status: 'blocked',
      findings: ['CHAT_CONTEXT_TOO_LARGE'],
      task: options.task,
      chatContext: { actualBytes: contextInfo.size, maximumBytes: MAX_CONTEXT_FILE_BYTES },
    };
  }
  let chatContext;
  try {
    chatContext = await safeFile(featureDir, contextPath, MAX_CONTEXT_FILE_BYTES);
  } catch {
    return { status: 'blocked', findings: ['CHAT_CONTEXT_FILE_MISSING_OR_INVALID'], task: options.task };
  }
  if (!chatContext.trim()) return { status: 'blocked', findings: ['CHAT_CONTEXT_EMPTY'], task: options.task };

  let jev;
  try {
    jev = await semanticReview({
      workspace,
      featureDir,
      event: 'chat_readiness',
      chatContext,
      onDemand: true,
    });
  } catch {
    return { status: 'blocked', findings: ['JEV_CHAT_READINESS_UNAVAILABLE'], task: options.task, jev: { selected: true, status: 'unavailable' } };
  }
  const safeReason = typeof jev.reason === 'string' && /^[a-z0-9_]{1,80}$/.test(jev.reason) ? jev.reason : undefined;
  const jevSummary = {
    selected: true,
    status: jev.status,
    ...(Number.isFinite(jev.confidence) ? { confidence: jev.confidence } : {}),
    ...(safeReason ? { reason: safeReason } : {}),
  };
  return jev.status === 'aligned'
    ? { status: 'ready', findings: [], task: options.task, jev: jevSummary }
    : { status: 'blocked', findings: [`JEV_CHAT_READINESS_${String(jev.status || 'unavailable').toUpperCase()}`], task: options.task, jev: jevSummary };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: gofer-pre-edit-check.mjs --workspace <repo> --feature-dir <path> --task T001 --changed-file <path> [--changed-file <path> [--jev-chat-readiness --chat-context-file <feature-relative-path>]]');
    return;
  }
  const result = await checkPreEdit(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'ready') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
