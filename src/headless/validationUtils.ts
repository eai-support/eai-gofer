/** Required-field predicate shared by the run and stage-execution validators. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
