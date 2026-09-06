export const RUNTIME_SURFACES = [
  'claude',
  'copilot',
  'codex',
  'antigravity',
  'antigravity-desktop',
] as const;

export type RuntimeSurface = (typeof RUNTIME_SURFACES)[number];
export type RuntimeSurfacePreference = RuntimeSurface | 'auto';

export const GEMINI_CLI_MIGRATION_MESSAGE =
  'Gemini CLI is retired as a Gofer surface. Choose "antigravity" (agy CLI) or ' +
  '"antigravity-desktop" explicitly. Existing settings and GEMINI.md are preserved; ' +
  'Gofer will not migrate credentials or silently select another provider.';

export function assertNotRetiredSurface(value: unknown): void {
  if (typeof value === 'string' && ['gemini', 'gemini-cli'].includes(value.trim().toLowerCase())) {
    throw new Error(GEMINI_CLI_MIGRATION_MESSAGE);
  }
}

export function parseRuntimeSurfacePreference(value: unknown): RuntimeSurfacePreference {
  assertNotRetiredSurface(value);
  if (value === 'auto' || RUNTIME_SURFACES.includes(value as RuntimeSurface)) {
    return value as RuntimeSurfacePreference;
  }
  throw new Error('Unknown Gofer runtime surface. Choose a supported surface in Gofer settings.');
}

export function isAntigravitySurface(
  value: unknown
): value is 'antigravity' | 'antigravity-desktop' {
  return value === 'antigravity' || value === 'antigravity-desktop';
}

export function assertAutonomousSurfaceSupported(value: unknown): void {
  assertNotRetiredSurface(value);
  if (isAntigravitySurface(value)) {
    throw new Error(
      `${value} is recognized for Gofer command routing, but autonomous execution is blocked. ` +
        'A verified Gofer adapter for native arguments, permissions and output is required. ' +
        'No CLI will be launched and no provider fallback will be selected.'
    );
  }
}
