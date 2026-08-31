import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.schema';

type CategoryRow = FieldOutputTypes['public']['ItemCategory'];

export async function createCategory(companyId: string, input: CreateCategoryInput): Promise<CategoryRow> {
  return db.orm.public.ItemCategory.create({ name: input.name, companyId });
}

export async function listCategories(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.ItemCategory
      .where((c) => c.companyId.eq(companyId))
      .where((c) => c.deletedAt.isNull())
      .include('company', (co) => co.select('id', 'name'))
      .orderBy((c) => c.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.ItemCategory
      .where((c) => c.companyId.eq(companyId))
      .where((c) => c.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getCategoryById(companyId: string, id: string): Promise<CategoryRow> {
  const category = await db.orm.public.ItemCategory
    .where((c) => c.id.eq(id))
    .where((c) => c.companyId.eq(companyId))
    .where((c) => c.deletedAt.isNull())
    .include('company', (co) => co.select('id', 'name'))
    .first();

  if (!category) {
    throw new NotFoundError('Category not found');
  }
  return category;
}

export async function updateCategory(
  companyId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow> {
  await getCategoryById(companyId, id);

  const updated = await db.orm.public.ItemCategory
    .where((c) => c.id.eq(id))
    .where((c) => c.companyId.eq(companyId))
    .update(omitUndefined(input));

  return updated!;
}

export async function softDeleteCategory(companyId: string, id: string): Promise<void> {
  await getCategoryById(companyId, id);

  await db.orm.public.ItemCategory
    .where((c) => c.id.eq(id))
    .where((c) => c.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}
