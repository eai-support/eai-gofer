import * as fs from 'fs';
import * as path from 'path';
import { SEMANTIC_HOST_DISPLAY_NAMES, type SemanticHost } from '../config/semanticHosts';

export interface SemanticHostEvidence {
  verified: boolean;
  sources: string[];
}

export interface SelectedSemanticHostStatus {
  icon: '$(check)' | '$(warning)';
  text: string;
  tooltip: string;
}

export interface SemanticHostEvidenceProbes {
  detectVersion(command: string): Promise<string | null>;
  supportsSubcommand(command: string, args: string[]): Promise<boolean>;
  extensionInstalled(extensionId: string): boolean;
  isVSCodeExtensionHost: boolean;
  isValidResource?(filePath: string, requiredPatterns: readonly RegExp[]): boolean;
}

function isValidResource(filePath: string, requiredPatterns: readonly RegExp[]): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size === 0) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return requiredPatterns.every((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

/**
 * Resolve concrete evidence for a selected semantic host.
 *
 * A saved setting is intentionally not evidence: it records user intent only.
 * The status UI may claim a host is verified only after finding its executable,
 * extension, execution context, or a regular workspace resource.
 */
export async function resolveSemanticHostEvidence(
  host: SemanticHost,
  workspacePath: string,
  probes: SemanticHostEvidenceProbes
): Promise<SemanticHostEvidence> {
  const sources: string[] = [];
  const resourceIsValid = probes.isValidResource ?? isValidResource;
  const addResource = (
    relativePath: string,
    label: string,
    requiredPatterns: readonly RegExp[]
  ): void => {
    if (resourceIsValid(path.join(workspacePath, relativePath), requiredPatterns)) {
      sources.push(label);
    }
  };
  const addExecutable = async (command: string, label: string): Promise<void> => {
    if ((await probes.detectVersion(command)) !== null) {
      sources.push(label);
    }
  };

  switch (host) {
    case 'claude':
      addResource(path.join('.claude', 'commands', 'eai.md'), 'Claude command resource', [
        /^# Eai$/m,
        /\bGofer\b/,
      ]);
      if (sources.length === 0) {
        await addExecutable('claude', 'Claude CLI');
      }
      break;
    case 'codex':
      addResource(path.join('.agents', 'skills', 'eai', 'SKILL.md'), 'Codex skill resource', [
        /^name:\s*eai\s*$/m,
        /^Host:.*\bCodex\b.*$/m,
      ]);
      if (sources.length === 0) {
        await addExecutable('codex', 'Codex CLI');
      }
      break;
    case 'copilot':
      if (
        probes.extensionInstalled('GitHub.copilot') ||
        probes.extensionInstalled('GitHub.copilot-chat')
      ) {
        sources.push('GitHub Copilot extension');
      }
      addResource(path.join('.github', 'prompts', 'eai.prompt.md'), 'Copilot prompt resource', [
        /^name:\s*eai\s*$/m,
        /^\s*publicEntrypoint:\s*true\s*$/m,
      ]);
      if (sources.length === 0) {
        await addExecutable('copilot', 'Copilot CLI');
      }
      if (sources.length === 0 && (await probes.supportsSubcommand('gh', ['copilot', '--help']))) {
        sources.push('GitHub CLI Copilot command');
      }
      break;
    case 'antigravity':
      addResource('GEMINI.md', 'Antigravity instruction resource', [
        /See @AGENTS\.md/,
        /<!-- gofer:always-on-eai:start -->/,
        /<!-- gofer:always-on-eai:end -->/,
      ]);
      addResource(
        path.join('.gemini', 'commands', 'gofer', 'eai.toml'),
        'Antigravity command resource',
        [/^prompt\s*=\s*"\{\{include:\s*\.\/eai\.md\}\}"\s*$/m]
      );
      if (sources.length === 0) {
        await addExecutable('agy', 'Antigravity CLI');
      }
      break;
    case 'grok':
      addResource(path.join('.grok', 'skills', 'eai', 'SKILL.md'), 'Grok skill resource', [
        /^name:\s*eai\s*$/m,
        /^Host:\s*Grok Build\s*$/m,
      ]);
      if (sources.length === 0) {
        await addExecutable('grok', 'Grok Build CLI');
      }
      break;
    case 'vscode':
      if (probes.isVSCodeExtensionHost) {
        sources.push('VS Code extension host');
      }
      break;
  }

  return { verified: sources.length > 0, sources };
}

export function buildSelectedSemanticHostStatus(
  host: SemanticHost,
  evidence: SemanticHostEvidence
): SelectedSemanticHostStatus {
  const text = SEMANTIC_HOST_DISPLAY_NAMES[host];
  if (!evidence.verified) {
    return {
      icon: '$(warning)',
      text,
      tooltip:
        `${text} selected via gofer.defaultCLI, but its executable or workspace ` +
        'resource has not been verified.',
    };
  }

  return {
    icon: '$(check)',
    text,
    tooltip:
      `${text} verified via ${evidence.sources.join(', ')}. ` +
      'Autonomous mode uses Claude/Codex fallback when required.',
  };
}
