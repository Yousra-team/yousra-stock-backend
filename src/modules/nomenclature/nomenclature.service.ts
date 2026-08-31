import { db, type Tx } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { isUniqueViolation } from '../../shared/dbErrors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getItemById } from '../catalog';
import { getUnitById } from '../measurements';
import type { CreateNomenclatureInput, UpdateNomenclatureInput } from './nomenclature.schema';

type NomenclatureRow = FieldOutputTypes['public']['Nomenclature'];
type NomenclatureLineRow = FieldOutputTypes['public']['NomenclatureLine'];
type NomenclatureWithLines = NomenclatureRow & { lines: NomenclatureLineRow[] };

/** Nomenclature has no `companyId` of its own — tenancy is inherited through `Item`, so every access re-verifies the parent item belongs to the caller's company. */
async function assertNomenclatureInCompany(companyId: string, nomenclature: NomenclatureRow): Promise<void> {
  await getItemById(companyId, nomenclature.itemId);
}

export async function createNomenclature(
  companyId: string,
  input: CreateNomenclatureInput,
): Promise<NomenclatureWithLines> {
  await getItemById(companyId, input.itemId);
  for (const line of input.lines) {
    await getItemById(companyId, line.subItemId);
    await getUnitById(line.unitId);
  }

  const { maxVersion } = await db.orm.public.Nomenclature
    .where((n) => n.itemId.eq(input.itemId))
    .aggregate((a) => ({ maxVersion: a.max('version') }));
  const version = (maxVersion ?? 0) + 1;

  try {
    return await db.transaction(async (tx) => {
      const nomenclature = await tx.orm.public.Nomenclature.create({
        itemId: input.itemId,
        isActive: false,
        version,
        notes: input.notes ?? null,
      });

      const lines: NomenclatureLineRow[] = [];
      for (const line of input.lines) {
        lines.push(
          await tx.orm.public.NomenclatureLine.create({
            nomenclatureId: nomenclature.id,
            subItemId: line.subItemId,
            quantity: line.quantity,
            unitId: line.unitId,
          }),
        );
      }

      return { ...nomenclature, lines };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // The version number was computed from a read outside this transaction, so a concurrent
      // create for the same itemId can race past it — turn the resulting @@unique([itemId, version])
      // violation into a clean, expected conflict rather than a raw 500. The caller can just retry.
      throw new ConflictError('Another version was created for this item at the same time — please retry');
    }
    throw err;
  }
}

export async function listNomenclature(
  companyId: string,
  pagination: PaginationParams,
  itemId?: string,
) {
  let itemIds: string[];
  if (itemId !== undefined) {
    await getItemById(companyId, itemId);
    itemIds = [itemId];
  } else {
    const companyItems = await db.orm.public.Item.where((i) => i.companyId.eq(companyId)).select('id').all();
    itemIds = companyItems.map((i) => i.id);
  }

  if (itemIds.length === 0) {
    return { items: [], meta: buildMeta(pagination, 0) };
  }

  const [items, { total }] = await Promise.all([
    db.orm.public.Nomenclature
      .where((n) => n.itemId.in(itemIds))
      .where((n) => n.deletedAt.isNull())
      .orderBy((n) => n.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.Nomenclature
      .where((n) => n.itemId.in(itemIds))
      .where((n) => n.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getNomenclatureById(companyId: string, id: string): Promise<NomenclatureWithLines> {
  const nomenclature = await db.orm.public.Nomenclature
    .include('lines', (branch) =>
      branch.select('id', 'nomenclatureId', 'subItemId', 'quantity', 'unitId', 'createdAt', 'updatedAt'),
    )
    .where((n) => n.id.eq(id))
    .where((n) => n.deletedAt.isNull())
    .first();

  if (!nomenclature) {
    throw new NotFoundError('Nomenclature not found');
  }
  await assertNomenclatureInCompany(companyId, nomenclature);
  return nomenclature;
}

export async function updateNomenclatureNotes(
  companyId: string,
  id: string,
  input: UpdateNomenclatureInput,
): Promise<NomenclatureRow> {
  const existing = await getNomenclatureById(companyId, id);

  const updated = await db.orm.public.Nomenclature.where((n) => n.id.eq(existing.id)).update(omitUndefined(input));
  return updated!;
}

/** Deactivates whichever version is currently active for the item, then activates this one — same transaction, so the "one active per item" index is never violated mid-flight. */
export async function activateNomenclature(companyId: string, id: string): Promise<NomenclatureRow> {
  // getNomenclatureById already 404s on a deleted row (see its own deletedAt filter) —
  // nothing further to check here.
  const nomenclature = await getNomenclatureById(companyId, id);

  return db.transaction(async (tx: Tx) => {
    await tx.orm.public.Nomenclature
      .where((n) => n.itemId.eq(nomenclature.itemId))
      .where((n) => n.isActive.eq(true))
      .update({ isActive: false });

    const activated = await tx.orm.public.Nomenclature.where((n) => n.id.eq(nomenclature.id)).update({
      isActive: true,
    });
    return activated!;
  });
}

export async function softDeleteNomenclature(companyId: string, id: string): Promise<void> {
  const nomenclature = await getNomenclatureById(companyId, id);
  if (nomenclature.isActive) {
    throw new ConflictError('Cannot delete the active nomenclature version — activate another version first');
  }

  await db.orm.public.Nomenclature
    .where((n) => n.id.eq(nomenclature.id))
    .update({ deletedAt: new Date().toISOString() });
}
