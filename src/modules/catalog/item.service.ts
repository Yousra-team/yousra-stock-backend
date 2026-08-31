import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getUnitById } from '../measurements';
import { getCategoryById } from './category.service';
import type { CreateItemInput, UpdateItemInput } from './item.schema';

type ItemRow = FieldOutputTypes['public']['Item'];

export async function createItem(companyId: string, input: CreateItemInput): Promise<ItemRow> {
  // Category is company-scoped; the base unit is global reference data — see contract comments.
  await getCategoryById(companyId, input.categoryId);
  await getUnitById(input.baseUnitId);

  return db.orm.public.Item.create({
    name: input.name,
    categoryId: input.categoryId,
    baseUnitId: input.baseUnitId,
    companyId,
    isStockable: input.isStockable,
    isBuyable: input.isBuyable,
    reorderThreshold: input.reorderThreshold ?? null,
  });
}

export async function listItems(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.Item
      .where((i) => i.companyId.eq(companyId))
      .where((i) => i.deletedAt.isNull())
      .orderBy((i) => i.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.Item
      .where((i) => i.companyId.eq(companyId))
      .where((i) => i.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getItemById(companyId: string, id: string): Promise<ItemRow> {
  const item = await db.orm.public.Item
    .where((i) => i.id.eq(id))
    .where((i) => i.companyId.eq(companyId))
    .where((i) => i.deletedAt.isNull())
    .first();

  if (!item) {
    throw new NotFoundError('Item not found');
  }
  return item;
}

export async function updateItem(companyId: string, id: string, input: UpdateItemInput): Promise<ItemRow> {
  await getItemById(companyId, id);

  if (input.categoryId !== undefined) {
    await getCategoryById(companyId, input.categoryId);
  }
  if (input.baseUnitId !== undefined) {
    await getUnitById(input.baseUnitId);
  }

  const updated = await db.orm.public.Item
    .where((i) => i.id.eq(id))
    .where((i) => i.companyId.eq(companyId))
    .update(omitUndefined(input));

  return updated!;
}

export async function softDeleteItem(companyId: string, id: string): Promise<void> {
  await getItemById(companyId, id);

  await db.orm.public.Item
    .where((i) => i.id.eq(id))
    .where((i) => i.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}
