/**
 * `Unit` is global reference data (no `companyId`), so every unit shows up in
 * every company's unit picker. The integration test suite runs against the
 * real configured database with no fixture reset, so it leaves throwaway units
 * behind (`StockUnit-<ts>`, `ProcUnit-<ts>`, `ExtUnit-<ts>`, …). This script
 * soft-deletes those so the picker only shows real units.
 *
 *   npx tsx src/scripts/cleanup-test-units.ts            # dry run — lists what it WOULD delete
 *   npx tsx src/scripts/cleanup-test-units.ts --apply    # soft-delete the test units
 *   npx tsx src/scripts/cleanup-test-units.ts --apply --seed   # also create a clean canonical set
 *
 * Reversible: a soft-deleted unit just has `deletedAt` set; clear it to restore.
 */
import { db } from '../prisma/db';

/** Name prefixes used by the test fixtures (see `test/*.test.ts`). */
const TEST_UNIT_NAME = /^(CatalogUnit|ExtUnit|StockUnit|ProcUnit|NomUnit|TestGram|TestKg|TestG|TestMass|TestVolume|TestBaseVolume|InUse)-/;

const CANONICAL = [
  { name: 'Kilogramme', symbol: 'kg', family: 'MASS', factorToBase: '1', isBase: true },
  { name: 'Gramme', symbol: 'g', family: 'MASS', factorToBase: '0.001', isBase: false },
  { name: 'Litre', symbol: 'L', family: 'VOLUME', factorToBase: '1', isBase: true },
  { name: 'Millilitre', symbol: 'ml', family: 'VOLUME', factorToBase: '0.001', isBase: false },
  { name: 'Unité', symbol: 'pc', family: 'UNIT', factorToBase: '1', isBase: true },
] as const;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const seed = process.argv.includes('--seed');

  const units = await db.orm.public.Unit
    .where((u) => u.deletedAt.isNull())
    .select('id', 'name', 'symbol', 'family')
    .all();

  const junk = units.filter((u) => TEST_UNIT_NAME.test(u.name));
  const keep = units.filter((u) => !TEST_UNIT_NAME.test(u.name));

  console.log(`Live units: ${units.length} — ${junk.length} test, ${keep.length} real.\n`);
  console.log('Test units%s:'.replace('%s', apply ? ' (soft-deleting)' : ' (dry run — would soft-delete)'));
  for (const u of junk) console.log(`  - ${u.name} (${u.symbol}) [${u.family}]  ${u.id}`);
  console.log('\nReal units kept:');
  for (const u of keep) console.log(`  = ${u.name} (${u.symbol}) [${u.family}]`);

  if (apply && junk.length > 0) {
    const now = new Date().toISOString();
    for (const u of junk) {
      await db.orm.public.Unit.where((x) => x.id.eq(u.id)).update({ deletedAt: now });
    }
    console.log(`\nSoft-deleted ${junk.length} test unit(s).`);
  } else if (!apply) {
    console.log('\nRe-run with --apply to soft-delete the above.');
  }

  if (seed) {
    console.log('\nSeeding canonical units...');
    for (const c of CANONICAL) {
      const exists = await db.orm.public.Unit
        .where((u) => u.name.eq(c.name))
        .where((u) => u.deletedAt.isNull())
        .first();
      if (exists) {
        console.log(`  = ${c.name} already exists — skipped`);
        continue;
      }
      try {
        await db.orm.public.Unit.create(c);
        console.log(`  + ${c.name} (${c.symbol})`);
      } catch (err) {
        console.log(`  ! ${c.name} skipped: ${(err as Error).message}`);
      }
    }
  }

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
