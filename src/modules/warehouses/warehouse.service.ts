import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateWarehouseInput, UpdateWarehouseInput } from './warehouse.schema';

type WarehouseRow = FieldOutputTypes['public']['Warehouse'];

export async function createWarehouse(companyId: string, input: CreateWarehouseInput): Promise<WarehouseRow> {
  return db.orm.public.Warehouse.create({ name: input.name, companyId });
}

export async function listWarehouses(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.Warehouse
      .where((w) => w.companyId.eq(companyId))
      .where((w) => w.deletedAt.isNull())
      .orderBy((w) => w.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.Warehouse
      .where((w) => w.companyId.eq(companyId))
      .where((w) => w.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getWarehouseById(companyId: string, id: string): Promise<WarehouseRow> {
  const warehouse = await db.orm.public.Warehouse
    .where((w) => w.id.eq(id))
    .where((w) => w.companyId.eq(companyId))
    .where((w) => w.deletedAt.isNull())
    .first();

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }
  return warehouse;
}

export async function updateWarehouse(
  companyId: string,
  id: string,
  input: UpdateWarehouseInput,
): Promise<WarehouseRow> {
  await getWarehouseById(companyId, id);

  const updated = await db.orm.public.Warehouse
    .where((w) => w.id.eq(id))
    .where((w) => w.companyId.eq(companyId))
    .update(omitUndefined(input));

  return updated!;
}

export async function softDeleteWarehouse(companyId: string, id: string): Promise<void> {
  await getWarehouseById(companyId, id);

  await db.orm.public.Warehouse
    .where((w) => w.id.eq(id))
    .where((w) => w.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}
