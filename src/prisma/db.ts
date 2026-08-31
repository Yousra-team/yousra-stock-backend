import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

/**
 * Trim surrounding quotes/whitespace that some hosting dashboards keep when a
 * value is pasted with the quotes included, then sanity-check it parses as a
 * URL — the raw `@prisma/orm-postgres` error ("unparseable url") doesn't say
 * which variable is wrong.
 */
function resolveDatabaseUrl(): string {
  const raw = process.env['DATABASE_URL']?.trim().replace(/^['"]|['"]$/g, '');
  if (!raw) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in the host environment as ' +
        'postgresql://user:password@host:5432/dbname (URL-encode special characters in the password).',
    );
  }
  try {
    // eslint-disable-next-line no-new
    new URL(raw);
  } catch {
    throw new Error(
      `DATABASE_URL is set but is not a valid URL (${JSON.stringify(raw.slice(0, 24))}...). ` +
        'Expected postgresql://user:password@host:5432/dbname with no surrounding quotes.',
    );
  }
  return raw;
}

export const db = postgres<Contract>({
  contractJson,
  url: resolveDatabaseUrl(),
});

/** The `tx` context handed to `db.transaction(async (tx) => ...)` callbacks — derived from `db` itself so it can never drift from the real runtime type. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
