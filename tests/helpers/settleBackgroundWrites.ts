/** Finish real writes before cleanup, retaining both write and cleanup failures. */
export async function settleBackgroundWrites(
  writes: readonly Promise<unknown>[],
  cleanup: () => void | Promise<void>
): Promise<void> {
  const results = await Promise.allSettled(writes);
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  try {
    await cleanup();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Background write or cleanup failed');
}
