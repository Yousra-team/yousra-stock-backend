/**
 * `isStockable` decides how the recipe explosion treats an item (see
 * `nomenclature.service.ts` — the explosion stops at every stock-tracked item).
 * This audit lists every non-deleted item with its `isStockable` flag and
 * whether it has an active recipe, and calls out the combinations that are
 * usually a mistake.
 *
 *   npx tsx src/scripts/audit-item-stock-flags.ts [companyId]
 *
 * With no arg, audits every company.
 */
import { db } from '../prisma/db';

type Row = { id: string; name: string; companyId: string; isStockable: boolean; hasActiveRecipe: boolean };

function classify(r: Row): { kind: string; warn: boolean } {
  if (r.isStockable && r.hasActiveRecipe) return { kind: 'semi-finished (stocked, has recipe)', warn: false };
  if (r.isStockable && !r.hasActiveRecipe) return { kind: 'raw material (stocked, no recipe)', warn: false };
  if (!r.isStockable && r.hasActiveRecipe) return { kind: 'finished / phantom (not stocked, has recipe)', warn: false };
  return { kind: 'DEAD END — not stocked and no recipe: cannot be consumed or built', warn: true };
}

async function main(): Promise<void> {
  const companyArg = process.argv[2];

  const items = await db.orm.public.Item
    .where((i) => i.deletedAt.isNull())
    .select('id', 'name', 'companyId', 'isStockable')
    .orderBy((i) => i.companyId.asc())
    .all();

  const activeRecipeItemIds = new Set(
    (
      await db.orm.public.Nomenclature
        .where((n) => n.isActive.eq(true))
        .where((n) => n.deletedAt.isNull())
        .select('itemId')
        .all()
    ).map((n) => n.itemId),
  );

  const rows: Row[] = items
    .filter((i) => !companyArg || i.companyId === companyArg)
    .map((i) => ({ ...i, hasActiveRecipe: activeRecipeItemIds.has(i.id) }));

  let warnings = 0;
  for (const r of rows) {
    const { kind, warn } = classify(r);
    if (warn) warnings++;
    console.log(`${warn ? '  ⚠  ' : '     '}${r.name.padEnd(32)} stockable=${String(r.isStockable).padEnd(5)} recipe=${String(r.hasActiveRecipe).padEnd(5)} → ${kind}   ${r.id}`);
  }

  console.log(`\n${rows.length} item(s), ${warnings} flagged.`);
  console.log(
    'Reminder: a finished product an external system orders should be stockable=false;\n' +
      'every physically-counted item (raw AND semi-finished) should be stockable=true.',
  );

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
