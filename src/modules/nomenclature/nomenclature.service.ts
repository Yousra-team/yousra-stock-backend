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
  /**
   * Active nomenclature id of the top item, if it has one — stamped on every
   * movement so a consumption can be traced back to the recipe it served.
   * Null only when the top item is itself stock-tracked with no recipe (it is
   * then consumed directly).
   */
  topNomenclatureId: string | null;
  /** stockedItemId -> total quantity needed, in that item's base unit. */
  requirements: Map<string, number>;
}

/**
 * Expands `quantity` units of `itemId` into the quantities of **stock-tracked
 * items** that must be drawn down.
 *
 * The explosion **stops at the first stock-tracked item on each branch** — raw
 * materials and semi-finished goods alike. A semi-finished good (e.g. "pâte à
 * farine") carries a recipe that describes how a *production run* builds it,
 * not how a parent order consumes it: the stock on hand was already produced
 * from flour in the past, so a pizza order draws down the dough, never the
 * flour behind it. Only a non-stock-tracked "phantom" (assembled fresh every
 * time, never held) is followed through to its own components.
 *
 * Throws:
 * - `RecipeMissingError` — the top item is not stock-tracked and has no
 *   active recipe (nothing to resolve it to).
 * - `ConflictError` — a recipe cycle, nesting past `MAX_RECIPE_DEPTH`, a
 *   phantom sub-assembly with no recipe, or a unit-family mismatch between a
 *   recipe line and its component's base unit.
 */
export async function explodeRequirements(
  companyId: string,
  itemId: string,
  quantity: number,
): Promise<ExplodedRequirements> {
  const top = await getRecipeNode(companyId, itemId);
  if (!top.item.isStockable && top.activeNomenclatureId === null) {
    throw new RecipeMissingError(`No active recipe for item(s): ${itemId}`);
  }

  const requirements = new Map<string, number>();
  await accumulate(companyId, top, quantity, requirements, new Set<string>(), 0, false);
  return { topNomenclatureId: top.activeNomenclatureId, requirements };
}

export interface ProductionInputs {
  /** The active recipe the batch is built from. */
  nomenclatureId: string;
  /** stockedItemId -> quantity consumed to build the batch, in that item's base unit. */
  inputs: Map<string, number>;
}

/**
 * Resolve the stock-tracked inputs consumed when a **production run** builds
 * `quantity` units of `itemId` from its active recipe. Unlike consumption, the
 * top item's recipe is always expanded (that is the point of a production run);
 * the explosion then stops at stock-tracked components exactly as
 * `explodeRequirements` does — a sub-recipe is only followed when its item is a
 * non-stocked phantom.
 *
 * Throws `ConflictError` if `itemId` has no active recipe, plus the same
 * cycle / depth / phantom / unit-family errors as `explodeRequirements`.
 */
export async function explodeProductionInputs(
  companyId: string,
  itemId: string,
  quantity: number,
): Promise<ProductionInputs> {
  const top = await getRecipeNode(companyId, itemId);
  if (top.activeNomenclatureId === null) {
    throw new ConflictError(`"${top.item.name}" has no active recipe to produce from`);
  }

  const inputs = new Map<string, number>();
  await accumulate(companyId, top, quantity, inputs, new Set<string>(), 0, true);
  return { nomenclatureId: top.activeNomenclatureId, inputs };
}

async function accumulate(
  companyId: string,
  node: RecipeNode,
  quantity: number,
  acc: Map<string, number>,
  path: Set<string>,
  depth: number,
  /** True only for a production run's entry item: expand its recipe even though it is stock-tracked. */
  expandStockedTop: boolean,
): Promise<void> {
  const forceExpand = expandStockedTop && depth === 0;

  // Stop at any stock-tracked item (raw material, or an already-produced
  // semi-finished good). Its recipe, if any, describes how a production run
  // BUILDS it — not how a parent consumes it — so we never follow it here.
  if (!forceExpand && node.item.isStockable) {
    acc.set(node.item.id, (acc.get(node.item.id) ?? 0) + quantity);
    return;
  }

  if (node.activeNomenclatureId === null) {
    // Not stock-tracked and no recipe → a phantom sub-assembly that can't be resolved.
    throw new ConflictError(
      `"${node.item.name}" is not stock-tracked and has no active recipe — cannot resolve it to consumable stock`,
    );
  }

  if (path.has(node.item.id)) {
    throw new ConflictError(`Recipe cycle detected: ${[...path, node.item.id].join(' -> ')}`);
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
    await accumulate(companyId, childNode, inChildBase, acc, nextPath, depth + 1, expandStockedTop);
  }
}
