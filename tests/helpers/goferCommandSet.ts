export interface ControlCommandExpectation {
  file: string;
  name: string;
}

export const PIPELINE_STAGE_FILES = [
  '0_gofer_start',
  '0a_problem_validation',
  '1_gofer_research',
  '2_gofer_specify',
  '3_gofer_plan',
  '4_gofer_tasks',
  '5_gofer_implement',
  '6_gofer_validate',
  '7_gofer_save',
  '7a_stakeholder_comms',
  '8_gofer_branding',
  '9_gofer_tests',
  '10_gofer_cloud',
  'gofer_constitution',
  'gofer_hydrate',
] as const;

export const LEGACY_CONTROL_COMMANDS: readonly ControlCommandExpectation[] = [
  { file: 'gofer_personality', name: 'gofer:personality' },
  { file: 'gofer_plan', name: 'gofer:plan' },
  { file: 'gofer_side', name: 'gofer:side' },
] as const;

export const HELPER_COMMANDS: readonly ControlCommandExpectation[] = [
  { file: 'gofer_check_workspace', name: 'gofer:check-workspace' },
  { file: 'gofer_bootstrap_workspace', name: 'gofer:bootstrap-workspace' },
  { file: 'gofer_eai_first_run', name: 'gofer:eai-first-run' },
  { file: 'gofer_diagnose', name: 'gofer:diagnose' },
  { file: 'gofer_spec_summary', name: 'gofer:spec-summary' },
  { file: 'gofer_tdd', name: 'gofer:tdd' },
  { file: 'gofer_vocabulary', name: 'gofer:vocabulary' },
  { file: 'gofer_zoom_out', name: 'gofer:zoom-out' },
] as const;

export const CONTROL_COMMANDS = [...LEGACY_CONTROL_COMMANDS, ...HELPER_COMMANDS] as const;

export const FULL_COMMAND_FILES = [
  ...PIPELINE_STAGE_FILES,
  ...CONTROL_COMMANDS.map((command) => command.file),
] as const;

export const FULL_COMMAND_NAMES = [
  ...PIPELINE_STAGE_FILES,
  ...CONTROL_COMMANDS.map((command) => command.name),
] as const;

export const PUBLIC_ENTRYPOINT_FILES = ['gofer', 'eai-gofer'] as const;

export const PUBLIC_ENTRYPOINT_NAMES = ['gofer', 'eai-gofer'] as const;

export const CANONICAL_DESCRIPTION_NAMES = [
  ...PIPELINE_STAGE_FILES,
  ...HELPER_COMMANDS.map((command) => command.name),
] as const;

export const FORMERLY_CLAUDE_ONLY_STAGES = [
  '0_gofer_start',
  'gofer_constitution',
  'gofer_hydrate',
  '7_gofer_save',
  '8_gofer_branding',
] as const;

export const CROSS_CLI_SURFACES = [
  'claude',
  'claude-mirror',
  'copilot',
  'vscode',
  'codex',
  'gemini',
  'github-prompts',
  'agents-skills',
  'system-skills',
] as const;

export const PIPELINE_STAGE_COUNT = PIPELINE_STAGE_FILES.length;
export const CONTROL_COMMAND_COUNT = CONTROL_COMMANDS.length;
export const FULL_COMMAND_COUNT = FULL_COMMAND_FILES.length;
export const PUBLIC_ENTRYPOINT_COUNT = PUBLIC_ENTRYPOINT_FILES.length;
export const CANONICAL_DESCRIPTION_COUNT = CANONICAL_DESCRIPTION_NAMES.length;

export function getGeneratedCommandFileStem(commandName: string): string {
  return commandName.replace(/:/g, '_').replace(/-/g, '_');
}
