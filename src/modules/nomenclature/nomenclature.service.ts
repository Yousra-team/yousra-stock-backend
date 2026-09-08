import { db, type Tx } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { ConflictError, NotFoundError, RecipeMissingError } from '../../shared/errors';
import { isUniqueViolation } from '../../shared/dbErrors';
import { omitUndefined } from '../../shared/omitUndefined';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getItemById } from '../catalog';
import { convertUnits, getUnitById } from '../measurements';
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
      .include('item', (it) => it.select('id', 'name'))
      .include('lines', (branch) =>
        branch
          .select('id', 'nomenclatureId', 'subItemId', 'quantity', 'unitId', 'createdAt', 'updatedAt')
          .include('subItem', (si) => si.select('id', 'name'))
          .include('unit', (u) => u.select('id', 'name', 'symbol')),
      )
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
    .include('item', (it) => it.select('id', 'name'))
    .include('lines', (branch) =>
      branch
        .select('id', 'nomenclatureId', 'subItemId', 'quantity', 'unitId', 'createdAt', 'updatedAt')
        .include('subItem', (si) => si.select('id', 'name'))
        .include('unit', (u) => u.select('id', 'name', 'symbol')),
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

// ---------------------------------------------------------------------------
// Recipe explosion — used by the external stock integration to turn an order
// for a finished item into ingredient-level `CONSUMPTION` movements.
// ---------------------------------------------------------------------------

/** How deep recursive sub-recipes may nest before we call it a data error. */
const MAX_RECIPE_DEPTH = 12;

interface RecipeLine {
  subItemId: string;
  subItemBaseUnitId: string;
  /** Quantity per one unit of the parent, in `unitId`. Decimal string. */
  quantity: string;
  unitId: string;
}

interface RecipeNode {
  item: { id: string; name: string; baseUnitId: string; isStockable: boolean };
  /** Null when the item has no active recipe — it is then a raw leaf ingredient. */
  activeNomenclatureId: string | null;
  lines: RecipeLine[];
}

/**
 * The item plus its active recipe (if any), shaped for `explodeRequirements`.
 * Re-verifies the item belongs to `companyId` (throws 404 otherwise).
 */
export async function getRecipeNode(companyId: string, itemId: string): Promise<RecipeNode> {
  const item = await getItemById(companyId, itemId);

  const active = await db.orm.public.Nomenclature
    .where((n) => n.itemId.eq(itemId))
    .where((n) => n.isActive.eq(true))
    .where((n) => n.deletedAt.isNull())
    .include('lines', (branch) =>
      branch
        .select('id', 'subItemId', 'quantity', 'unitId')
        .include('subItem', (si) => si.select('id', 'baseUnitId')),
    )
    .first();

  return {
    item: {
      id: item.id,
      name: item.name,
      baseUnitId: item.baseUnitId,
      isStockable: item.isStockable,
    },
    activeNomenclatureId: active?.id ?? null,
    lines: (active?.lines ?? []).map((l) => ({
      subItemId: l.subItemId,
      subItemBaseUnitId: l.subItem.baseUnitId,
      quantity: l.quantity,
      unitId: l.unitId,
    })),
  };
}

export interface ExplodedRequirements {
  /** Active nomenclature id of the top finished item — stamped on every movement. */
  topNomenclatureId: string;
  /** rawIngredientItemId -> total quantity needed, in that ingredient's base unit. */
  requirements: Map<string, number>;
}

/**
 * Recursively expands `quantity` units of `finishedItemId` into the raw
 * ingredient quantities that must be consumed, following each ingredient's own
 * active recipe until every branch bottoms out at a stock-tracked leaf.
 *
 * Throws:
 * - `RecipeMissingError` — the top item has no active recipe.
 * - `ConflictError` — a recipe cycle, nesting past `MAX_RECIPE_DEPTH`, a
 *   leaf ingredient that is not stock-tracked, or a unit-family mismatch
 *   between a recipe line and its ingredient's base unit.
 */
export async function explodeRequirements(
  companyId: string,
  finishedItemId: string,
  quantity: number,
): Promise<ExplodedRequirements> {
  const top = await getRecipeNode(companyId, finishedItemId);
  if (top.activeNomenclatureId === null) {
    throw new RecipeMissingError(`No active recipe for item(s): ${finishedItemId}`);
  }

  const requirements = new Map<string, number>();
  await accumulate(companyId, top, quantity, requirements, new Set<string>(), 0);
  return { topNomenclatureId: top.activeNomenclatureId, requirements };
}

async function accumulate(
  companyId: string,
  node: RecipeNode,
  quantity: number,
  acc: Map<string, number>,
  path: Set<string>,
  depth: number,
): Promise<void> {
  if (node.activeNomenclatureId === null) {
    // Raw leaf ingredient.
    if (!node.item.isStockable) {
      throw new ConflictError(
        `Recipe ingredient "${node.item.name}" has no recipe and is not stock-tracked`,
      );
    }
    acc.set(node.item.id, (acc.get(node.item.id) ?? 0) + quantity);
    return;
  }

  if (path.has(node.item.id)) {
    throw new ConflictError(
      `Recipe cycle detected: ${[...path, node.item.id].join(' -> ')}`,
    );
  }
  if (depth >= MAX_RECIPE_DEPTH) {
    throw new ConflictError(`Recipe nesting exceeds ${MAX_RECIPE_DEPTH} levels at "${node.item.name}"`);
  }

  const nextPath = new Set(path).add(node.item.id);
  for (const line of node.lines) {
    const perParent = Number(line.quantity) * quantity;
    const inChildBase =
      line.unitId === line.subItemBaseUnitId
        ? perParent
        : (await convertUnits(line.unitId, line.subItemBaseUnitId, perParent)).result;

    const childNode = await getRecipeNode(companyId, line.subItemId);
    await accumulate(companyId, childNode, inChildBase, acc, nextPath, depth + 1);
  }
}
