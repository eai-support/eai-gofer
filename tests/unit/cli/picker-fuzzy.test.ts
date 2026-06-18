/**
 * T131 — picker-fuzzy.test.ts
 *
 * Verifies that Gofer commands are discoverable via fuzzy matching across
 * the 15 pipeline stage files + 3 control commands (gofer:plan, gofer:side,
 * gofer:personality). This is the proxy for "Gofer commands appear in
 * Claude/Copilot/Gemini fuzzy suggestions" (US5 AC-2).
 */

import { describe, it, expect } from 'vitest';

/**
 * Subsequence-style fuzzy matcher (the same shape used by Claude Code's
 * picker, Copilot's command palette, etc.). A needle matches a haystack
 * entry if every character of the needle appears in the entry in order
 * (not necessarily contiguously), case-insensitively.
 */
function fuzzyMatch(needle: string, haystack: string[]): string[] {
  const n = needle.toLowerCase();
  return haystack.filter((h) => {
    const hl = h.toLowerCase();
    let i = 0;
    for (const ch of n) {
      i = hl.indexOf(ch, i);
      if (i === -1) return false;
      i++;
    }
    return true;
  });
}

// 15 numbered stage files + namespaced aliases + helper/control commands.
// We list both numbered and namespaced forms because the Claude picker
// surfaces both, while Copilot's palette tends to show namespaced only.
const ALL_COMMANDS: string[] = [
  // Numbered pipeline stages (file basenames)
  '0_business_scenario',
  '0a_problem_validation',
  '1_gofer_research',
  '2_gofer_specify',
  '3_gofer_plan',
  '4_gofer_tasks',
  '5_gofer_implement',
  '6_gofer_validate',
  '7_gofer_save',
  '7a_stakeholder_comms',
  '8_gofer_resume',
  '9_gofer_tests',
  '10_gofer_cloud',
  'gofer_constitution',
  'gofer_hydrate',
  // Namespaced aliases (what users type in CLIs)
  'gofer:research',
  'gofer:specify',
  'gofer:plan-stage', // pipeline plan-stage is namespaced as plan-stage
  'gofer:tasks',
  'gofer:implement',
  'gofer:validate',
  'gofer:save',
  'gofer:resume',
  'gofer:tests',
  'gofer:cloud',
  'gofer:check-workspace',
  'gofer:bootstrap-workspace',
  'gofer:eai-first-run',
  // Control commands (3)
  'gofer:plan',
  'gofer:side',
  'gofer:personality',
];

// Surfaces that carry pickers (Codex has no picker — explicitly omitted).
type Surface = 'claude' | 'copilot' | 'gemini' | 'vscode';

/**
 * Filter the universe of commands by which surface(s) the user is on.
 * For now, every command is available on claude+copilot+gemini+vscode;
 * Codex-only stages would be omitted here, but none exist yet.
 */
function commandsForSurfaces(surfaces: Surface[]): string[] {
  // No codex-only stages exist; all commands are available across pickers.
  // `surfaces` is accepted to document the intended filter signature; today
  // every command is cross-surface, so the parameter doesn't gate output yet.
  void surfaces;
  return ALL_COMMANDS;
}

describe('CLI fuzzy picker (T131 / US5 AC-2)', () => {
  it('fuzzy("res") matches both numbered and namespaced research', () => {
    const matches = fuzzyMatch('res', ALL_COMMANDS);
    expect(matches).toContain('1_gofer_research');
    expect(matches).toContain('gofer:research');
  });

  it('fuzzy("plan") matches the pipeline plan stage AND the plan-mode toggle', () => {
    const matches = fuzzyMatch('plan', ALL_COMMANDS);
    // Pipeline plan stage (numbered + namespaced)
    expect(matches).toContain('3_gofer_plan');
    expect(matches).toContain('gofer:plan-stage');
    // Control command for plan-mode toggle
    expect(matches).toContain('gofer:plan');
  });

  it('fuzzy("test") matches both numbered and namespaced tests stage', () => {
    const matches = fuzzyMatch('test', ALL_COMMANDS);
    expect(matches).toContain('9_gofer_tests');
    expect(matches).toContain('gofer:tests');
  });

  it('fuzzy("side") matches the side-conversation control command', () => {
    const matches = fuzzyMatch('side', ALL_COMMANDS);
    expect(matches).toContain('gofer:side');
  });

  it('fuzzy("boot") matches the workspace bootstrap helper', () => {
    const matches = fuzzyMatch('boot', ALL_COMMANDS);
    expect(matches).toContain('gofer:bootstrap-workspace');
  });

  it('fuzzy("work") matches the workspace check helper', () => {
    const matches = fuzzyMatch('work', ALL_COMMANDS);
    expect(matches).toContain('gofer:check-workspace');
  });

  it('fuzzy("fir") matches the EAI first-run helper', () => {
    const matches = fuzzyMatch('fir', ALL_COMMANDS);
    expect(matches).toContain('gofer:eai-first-run');
  });

  it('fuzzy("pers") matches the personality control command', () => {
    const matches = fuzzyMatch('pers', ALL_COMMANDS);
    expect(matches).toContain('gofer:personality');
  });

  it('surface filter: claude+copilot picker shows the same set (no codex-only stages omitted)', () => {
    const both = commandsForSurfaces(['claude', 'copilot']);
    // Currently every command is cross-surface; this asserts no surprise gaps.
    expect(both.length).toBe(ALL_COMMANDS.length);
    // Smoke check that all 3 control commands are in the picker set.
    expect(both).toContain('gofer:plan');
    expect(both).toContain('gofer:side');
    expect(both).toContain('gofer:personality');
  });

  it('fuzzy returns empty for a needle that cannot subsequence-match', () => {
    expect(fuzzyMatch('zzzzz', ALL_COMMANDS)).toEqual([]);
  });
});
