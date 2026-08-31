import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateSupplierInput, UpdateSupplierInput } from './supplier.schema';

type SupplierRow = FieldOutputTypes['public']['Supplier'];

export async function createSupplier(companyId: string, input: CreateSupplierInput): Promise<SupplierRow> {
  return db.orm.public.Supplier.create({
    name: input.name,
    country: input.country,
    city: input.city,
    address: input.address,
    description: input.description ?? null,
    phone: input.phone,
    email: input.email,
    type: input.type,
    companyId,
  });
}

export async function listSuppliers(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.Supplier
      .where((s) => s.companyId.eq(companyId))
      .where((s) => s.deletedAt.isNull())
      .include('company', (c) => c.select('id', 'name'))
      .orderBy((s) => s.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.Supplier
      .where((s) => s.companyId.eq(companyId))
      .where((s) => s.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getSupplierById(companyId: string, id: string): Promise<SupplierRow> {
  const supplier = await db.orm.public.Supplier
    .where((s) => s.id.eq(id))
    .where((s) => s.companyId.eq(companyId))
    .where((s) => s.deletedAt.isNull())
    .include('company', (c) => c.select('id', 'name'))
    .first();

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }
  return supplier;
}

export async function updateSupplier(
  companyId: string,
  id: string,
  input: UpdateSupplierInput,
): Promise<SupplierRow> {
  await getSupplierById(companyId, id);

  const updated = await db.orm.public.Supplier
    .where((s) => s.id.eq(id))
    .where((s) => s.companyId.eq(companyId))
    .update(omitUndefined(input));

  return updated!;
}

export async function softDeleteSupplier(companyId: string, id: string): Promise<void> {
  await getSupplierById(companyId, id);

  await db.orm.public.Supplier
    .where((s) => s.id.eq(id))
    .where((s) => s.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}
