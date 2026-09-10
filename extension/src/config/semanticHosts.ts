export const CURRENT_SEMANTIC_HOSTS = [
  'claude',
  'codex',
  'copilot',
  'antigravity',
  'grok',
  'vscode',
] as const;

export type SemanticHost = (typeof CURRENT_SEMANTIC_HOSTS)[number];
export type SemanticHostSelection = SemanticHost | 'auto';

export const AUTONOMOUS_CLI_PROVIDERS = ['claude', 'codex', 'auto'] as const;
export type AutonomousCLIProvider = (typeof AUTONOMOUS_CLI_PROVIDERS)[number];

const SEMANTIC_HOST_SET = new Set<string>(CURRENT_SEMANTIC_HOSTS);
const AUTONOMOUS_CLI_PROVIDER_SET = new Set<string>(AUTONOMOUS_CLI_PROVIDERS);

export const SEMANTIC_HOST_DISPLAY_NAMES: Readonly<Record<SemanticHost, string>> = {
  claude: 'Claude Code',
  codex: 'OpenAI Codex',
  copilot: 'GitHub Copilot',
  antigravity: 'Google Antigravity',
  grok: 'Grok Build',
  vscode: 'VS Code',
};

/** Current user-facing command prefix for each supported semantic host. */
export const SEMANTIC_HOST_INVOCATION_PREFIX: Readonly<Record<SemanticHost, '/' | '$'>> = {
  claude: '/',
  codex: '$',
  copilot: '/',
  antigravity: '/',
  grok: '/',
  vscode: '/',
};

export function isSemanticHost(value: unknown): value is SemanticHost {
  return typeof value === 'string' && SEMANTIC_HOST_SET.has(value);
}

/**
 * Normalize the current persisted host setting before it reaches a result, log,
 * or UI. Retired and unknown values reset to `auto`; legacy aliases are handled
 * only by the updater/bootstrap migration boundaries that can identify their
 * provenance.
 */
export function normalizeSemanticHost(value: unknown): SemanticHostSelection {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'auto';
  if (normalized === 'auto' || isSemanticHost(normalized)) {
    return normalized;
  }
  return 'auto';
}

export function normalizeAutonomousCLIProvider(value: unknown): AutonomousCLIProvider {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'auto';
  return AUTONOMOUS_CLI_PROVIDER_SET.has(normalized)
    ? (normalized as AutonomousCLIProvider)
    : 'auto';
}
