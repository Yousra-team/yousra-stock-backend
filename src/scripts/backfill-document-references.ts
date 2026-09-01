/**
 * One-off backfill for the `reference` columns added in
 * `20260901T1004_add_document_references`.
 *
 * Assigns `<SCOPE>-YY-MM-DD-NNN` to every `purchaseOrder` / `goodsReceipt` /
 * `stockMovement` row that has none, numbering per UTC day in `createdAt` order,
 * then seeds `documentCounter` so live allocation continues past the highest
 * backfilled number. Safe to re-run: rows that already have a reference are
 * skipped and the counter is re-levelled to the current max.
 *
 * Invoices are deliberately left alone — rewriting an already-issued
 * `invoiceNumber` would change a number that may already be on a printed
 * document. New invoices get `INV-YY-MM-DD-NNN`; existing ones keep their
 * legacy `INV-<uuid>` value.
 *
 *   doppler run -- npx tsx src/scripts/backfill-document-references.ts
 */
import { db, type Tx } from '../prisma/db';

/** `(table, scope)` pairs. Both sides are hardcoded — never user input — so the
 *  values are safe to inline straight into the SQL text below. */
const TARGETS = [
  ['purchaseOrder', 'PO'],
  ['goodsReceipt', 'GR'],
  ['stockMovement', 'SM'],
] as const;

/**
 * Run a fixed SQL string through the raw lane. `db.raw.sql` is a tagged
 * template whose `${}` slots become bound parameters; this backfill needs
 * whole-identifier substitution (`"purchaseOrder"`) which parameters can't do,
 * and every dynamic piece here is a compile-time constant, so a hand-built
 * single-fragment template is the honest tool.
 */
async function rawExec(tx: Tx, sql: string): Promise<unknown> {
  const strings = Object.assign([sql], { raw: [sql] }) as unknown as TemplateStringsArray;
  return tx.execute(db.raw.sql(strings).affectedCount().build());
}

async function backfill(table: string, scope: string): Promise<void> {
  const day = `to_char(t."createdAt" AT TIME ZONE 'UTC', 'YY-MM-DD')`;

  await db.transaction(async (tx) => {
    const assigned = await rawExec(
      tx,
      `WITH numbered AS (
         SELECT t.id,
                ${day} AS day,
                COALESCE(c."value", 0) + row_number() OVER (
                  PARTITION BY ${day}
                  ORDER BY t."createdAt", t.id
                ) AS seq
         FROM "${table}" t
         LEFT JOIN "documentCounter" c
           ON c."scope" = '${scope}' AND c."day" = ${day}
         WHERE t."reference" IS NULL
       )
       UPDATE "${table}" t
       SET "reference" = '${scope}-' || n.day || '-' || lpad(n.seq::text, 3, '0')
       FROM numbered n
       WHERE t.id = n.id`,
    );

    const seeded = await rawExec(
      tx,
      `INSERT INTO "documentCounter" ("scope", "day", "value", "createdAt", "updatedAt")
       SELECT '${scope}', to_char("createdAt" AT TIME ZONE 'UTC', 'YY-MM-DD'), count(*)::int, now(), now()
       FROM "${table}"
       WHERE "reference" IS NOT NULL
       GROUP BY 2
       ON CONFLICT ("scope", "day")
       DO UPDATE SET "value" = GREATEST("documentCounter"."value", EXCLUDED."value"), "updatedAt" = now()`,
    );

    console.log(`${table}: assigned ${JSON.stringify(assigned)}; counter ${JSON.stringify(seeded)}`);
  });
}

async function main(): Promise<void> {
  for (const [table, scope] of TARGETS) {
    await backfill(table, scope);
  }
  console.log('Backfill complete.');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
