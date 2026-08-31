/**
 * True if `err` is a Postgres unique-constraint violation (SQL state 23505),
 * however many layers the driver/ORM wrapped it in. Services use this to
 * turn a duplicate-key write into a 409 `ConflictError` instead of a 500.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const record = err as Record<string, unknown>;
  if (record['sqlState'] === '23505' || record['code'] === '23505') {
    return true;
  }

  return isUniqueViolation(record['cause']);
}
