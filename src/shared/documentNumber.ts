import { db, type Tx } from '../prisma/db';

/**
 * Human-readable document numbering — `<SCOPE>-YY-MM-DD-NNN`
 * (e.g. `PO-26-09-01-001`). The UUID primary keys stay as they are; this is a
 * second, printable identifier that clients fetch and show on purchase orders,
 * goods receipts, invoices, and stock movements.
 *
 * `NNN` is a per-`(scope, day)` counter kept in `documentCounter`, one row per
 * pair. It is bumped with a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so two documents created at
 * the same instant each get a distinct number with no row lock to reason about
 * (unlike the read-then-write races catalogued in the README). Always call this
 * inside the same transaction as the row it numbers — a rolled-back create then
 * releases the number instead of leaving a gap.
 */
export type DocumentScope = 'PO' | 'GR' | 'INV' | 'SM';

/** `YY-MM-DD` in UTC — the date segment of a reference. */
export function referenceDay(date = new Date()): string {
  // toISOString() -> '2026-09-01T...'; slice(2, 10) -> '26-09-01'.
  return date.toISOString().slice(2, 10);
}

interface CounterRow {
  value: number;
}

/** Allocates and returns the next reference for `scope`, e.g. `PO-26-09-01-001`. */
export async function allocateDocumentReference(tx: Tx, scope: DocumentScope): Promise<string> {
  const day = referenceDay();

  const plan = db.raw.sql`
    INSERT INTO "documentCounter" ("scope", "day", "value", "createdAt", "updatedAt")
    VALUES (${scope}, ${day}, 1, now(), now())
    ON CONFLICT ("scope", "day")
    DO UPDATE SET "value" = "documentCounter"."value" + 1, "updatedAt" = now()
    RETURNING "value"
  `
    .returnsRow({ value: 'pg/int4@1' })
    .build();

  const rows = (await tx.query(plan)) as CounterRow[];
  const next = rows[0]!.value;

  // padStart keeps ≤999 zero-padded to 3 digits and lets 1000+ grow naturally.
  return `${scope}-${day}-${String(next).padStart(3, '0')}`;
}
