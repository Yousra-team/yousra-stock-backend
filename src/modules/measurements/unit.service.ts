import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import { isUniqueViolation } from '../../shared/dbErrors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateUnitInput, UpdateUnitInput } from './unit.schema';

type UnitRow = FieldOutputTypes['public']['Unit'];

/** Units are global reference data — no `companyId` scoping (see the contract comment on `Unit`). */
export async function createUnit(input: CreateUnitInput): Promise<UnitRow> {
  try {
    return await db.orm.public.Unit.create({
      name: input.name,
      symbol: input.symbol,
      family: input.family,
      factorToBase: input.factorToBase,
      isBase: input.isBase,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        input.isBase ? `A base unit already exists for family ${input.family}` : 'Duplicate unit',
      );
    }
    throw err;
  }
}

export async function listUnits(pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.Unit
      .where((u) => u.deletedAt.isNull())
      .orderBy((u) => u.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.Unit.where((u) => u.deletedAt.isNull()).aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getUnitById(id: string): Promise<UnitRow> {
  const unit = await db.orm.public.Unit
    .where((u) => u.id.eq(id))
    .where((u) => u.deletedAt.isNull())
    .first();

  if (!unit) {
    throw new NotFoundError('Unit not found');
  }
  return unit;
}

export async function updateUnit(id: string, input: UpdateUnitInput): Promise<UnitRow> {
  await getUnitById(id);

  try {
    const updated = await db.orm.public.Unit.where((u) => u.id.eq(id)).update(omitUndefined(input));
    return updated!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('A base unit already exists for this family');
    }
    throw err;
  }
}

/**
 * Blocks deleting a unit that active records still point at. `Item.baseUnitId`
 * and `NomenclatureLine.unitId` are `NOT NULL` foreign keys, so a hard delete is
 * impossible and a soft delete would leave those rows referencing a unit that no
 * longer appears in any picker — the client keeps rendering it (e.g. via the
 * `baseUnit` embed on `GET /catalog/items`), which reads as "delete didn't work".
 * Refusing the delete with the reference counts is the honest answer.
 */
async function assertUnitNotReferenced(id: string): Promise<void> {
  const [{ itemCount }, { lineCount }] = await Promise.all([
    db.orm.public.Item
      .where((i) => i.baseUnitId.eq(id))
      .where((i) => i.deletedAt.isNull())
      .aggregate((a) => ({ itemCount: a.count() })),
    db.orm.public.NomenclatureLine
      .where((l) => l.unitId.eq(id))
      .aggregate((a) => ({ lineCount: a.count() })),
  ]);

  const items = Number(itemCount);
  const lines = Number(lineCount);
  if (items + lines > 0) {
    const parts: string[] = [];
    if (items > 0) parts.push(`${items} item${items === 1 ? '' : 's'}`);
    if (lines > 0) parts.push(`${lines} nomenclature line${lines === 1 ? '' : 's'}`);
    throw new ConflictError(
      `Unit is still in use by ${parts.join(' and ')}. Reassign or remove them before deleting this unit.`,
    );
  }
}

/**
 * Soft delete — `deletedAt` is stamped rather than the row removed, because units
 * are referenced by `Item`, `NomenclatureLine`, and historical stock records that
 * must stay readable. Every read path (`listUnits`, `getUnitById`) filters
 * `deletedAt IS NULL`, so a soft-deleted unit disappears from the API surface.
 */
export async function softDeleteUnit(id: string): Promise<void> {
  await getUnitById(id);
  await assertUnitNotReferenced(id);
  await db.orm.public.Unit.where((u) => u.id.eq(id)).update({ deletedAt: new Date().toISOString() });
}

export interface ConvertResult {
  fromUnitId: string;
  toUnitId: string;
  quantity: number;
  result: number;
  family: string;
}

/** Converts `quantity` of `fromUnitId` into `toUnitId` via each unit's `factorToBase` — see the ERD note on `Unit`. */
export async function convertUnits(fromUnitId: string, toUnitId: string, quantity: number): Promise<ConvertResult> {
  const [fromUnit, toUnit] = await Promise.all([getUnitById(fromUnitId), getUnitById(toUnitId)]);

  if (fromUnit.family !== toUnit.family) {
    throw new BadRequestError(
      `Cannot convert between different unit families (${fromUnit.family} vs ${toUnit.family})`,
    );
  }

  const quantityInBase = quantity * Number(fromUnit.factorToBase);
  const result = quantityInBase / Number(toUnit.factorToBase);

  return { fromUnitId, toUnitId, quantity, result, family: fromUnit.family };
}
