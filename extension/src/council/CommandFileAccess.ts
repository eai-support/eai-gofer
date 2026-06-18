import * as fs from 'fs';

export type CommandWarningLogger = (message: string, metadata: Record<string, unknown>) => void;

export function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as NodeJS.ErrnoException).code === 'ENOENT' ||
      (error as NodeJS.ErrnoException).code === 'ENOTDIR')
  );
}

export async function readDirectorySafe(
  directoryPath: string,
  operation: string,
  logWarning: CommandWarningLogger
): Promise<string[]> {
  try {
    return await fs.promises.readdir(directoryPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    logWarning('Failed to read command directory', {
      operation,
      directoryPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to read command directory: ${directoryPath}`, { cause: error });
  }
}

export async function pathExistsSafe(
  targetPath: string,
  operation: string,
  logWarning: CommandWarningLogger
): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    logWarning('Failed to access command path', {
      operation,
      targetPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Failed to access command path: ${targetPath}`, { cause: error });
  }
}
