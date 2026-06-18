import { execFile } from 'child_process';
import type { ExecFileException } from 'child_process';

const SEMVER_PATTERN = /(?:^|[^\d])(\d+\.\d+\.\d+)(?:[^\d]|$)/;
const MAJOR_MINOR_PATTERN = /(?:^|[^\d])(\d+\.\d+)(?:[^\d]|$)/;

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface EaiCliVersionInfo {
  fullVersion: string;
  majorMinor: string;
  rawOutput: string;
}

export type EaiCliCommandRunner = (
  command: string,
  args: readonly string[]
) => Promise<CommandExecutionResult>;

export function parseEaiCliVersion(output: string): string | null {
  const semverMatch = output.match(SEMVER_PATTERN);
  if (semverMatch?.[1]) {
    return semverMatch[1];
  }

  const majorMinorMatch = output.match(MAJOR_MINOR_PATTERN);
  if (majorMinorMatch?.[1]) {
    return `${majorMinorMatch[1]}.0`;
  }

  return null;
}

export function parseMajorMinorVersion(version: string): string | null {
  const match = version.trim().match(/^(\d+)\.(\d+)(?:\.\d+)?$/);
  if (!match) {
    return null;
  }

  return `${match[1]}.${match[2]}`;
}

export function extractEaiCliVersionInfo(output: string): EaiCliVersionInfo | null {
  const fullVersion = parseEaiCliVersion(output);
  if (!fullVersion) {
    return null;
  }

  const majorMinor = parseMajorMinorVersion(fullVersion);
  if (!majorMinor) {
    return null;
  }

  return {
    fullVersion,
    majorMinor,
    rawOutput: output.trim(),
  };
}

function isNodeErrorWithCode(error: unknown): error is ExecFileException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isRecoverableCommandError(error: unknown): boolean {
  if (!isNodeErrorWithCode(error)) {
    return false;
  }

  return error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM';
}

export async function defaultEaiCliCommandRunner(
  command: string,
  args: readonly string[]
): Promise<CommandExecutionResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], (error, stdout, stderr) => {
      if (!error) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0,
        });
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: isNodeErrorWithCode(error) && typeof error.code === 'number' ? error.code : 1,
      });
    });
  });
}

export async function detectInstalledEaiCliVersion(
  commandRunner: EaiCliCommandRunner = defaultEaiCliCommandRunner
): Promise<EaiCliVersionInfo | null> {
  const attempts: ReadonlyArray<readonly string[]> = [['--version'], ['version']];

  for (const args of attempts) {
    try {
      const result = await commandRunner('eai', args);
      const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();

      if (!combinedOutput) {
        continue;
      }

      const parsed = extractEaiCliVersionInfo(combinedOutput);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      if (isRecoverableCommandError(error)) {
        continue;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `EAI_CLI_VERSION_DETECTION_FAILED: eai ${args.join(' ')} failed with unexpected error: ${errorMessage}`,
        { cause: error }
      );
    }
  }

  return null;
}
