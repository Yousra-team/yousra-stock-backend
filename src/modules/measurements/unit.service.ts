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

export async function softDeleteUnit(id: string): Promise<void> {
  await getUnitById(id);
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
