export interface V4ResourceContractViolation {
  ruleId: string;
  file: string;
  line: number;
  message: string;
  remediation: string;
  documentation: string;
}

export function validateSourceContent(
  content: string,
  file?: string
): V4ResourceContractViolation[];

export function validateWorkspace(workspace: string): Promise<{
  valid: boolean;
  filesScanned: number;
  violations: V4ResourceContractViolation[];
}>;
