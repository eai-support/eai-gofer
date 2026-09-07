import { execFile } from 'node:child_process';

// Own the direct child until close, including when it ignores SIGTERM. This is
// deliberately not a process-tree guarantee: trusted repository code can fork.
export function runOwnedCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  if (signal?.aborted) return Promise.reject(new Error('Tool call cancelled'));
  return new Promise((resolve, reject) => {
    let result: { stdout: string; stderr: string } = { stdout: '', stderr: '' };
    let failure: Error | null = null;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    let stopping = false;
    const child = execFile(
      command,
      args,
      { cwd, maxBuffer: 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        result = { stdout, stderr };
        failure ??= error;
        // execFile can report output overflow before an uncooperative child closes.
        if (error) terminate(error);
      }
    );
    const terminate = (error: Error) => {
      failure ??= error;
      if (stopping || child.exitCode !== null || child.signalCode !== null) return;
      stopping = true;
      child.kill('SIGTERM');
      escalation = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 250);
    };
    const cancel = () => terminate(new Error('Tool call cancelled'));
    const deadline = setTimeout(() => terminate(new Error('Command timed out')), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    child.once('close', () => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      signal?.removeEventListener('abort', cancel);
      if (failure) reject(Object.assign(failure, result));
      else resolve(result);
    });
  });
}
