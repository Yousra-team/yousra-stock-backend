import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import type { ExternalSystemContext } from '../../shared/request-context';
import { ConflictError, NotFoundError, RecipeMissingError, UnauthorizedError } from '../../shared/errors';
import { getWarehouseByCode } from '../warehouses';
import { explodeRequirements, getRecipeNode } from '../nomenclature';
import { findExternalMovements, getStockQuantities, recordStockMovement } from '../stock';
import type { ConsumeInput, ExternalStockQuery, ReleaseInput } from './external.schema';

type StockMovementRow = FieldOutputTypes['public']['StockMovement'];

/** What the external caller gets back for one recorded movement. */
interface MovementResult {
  movementId: string;
  reference: string | null;
  itemId: string;
  warehouseId: string;
  quantity: string;
  type: StockMovementRow['type'];
}

function toMovementResult(m: StockMovementRow): MovementResult {
  return {
    movementId: m.id,
    reference: m.reference,
    itemId: m.itemId,
    warehouseId: m.warehouseId,
    quantity: m.quantity,
    type: m.type,
  };
}

/**
 * The token authenticated the request (in `requireExternalSystem`); the name
 * the caller put in the request body/query must still match the row it
 * resolved to. A leaked token used under the wrong name fails here.
 */
function assertSystemName(ctx: ExternalSystemContext, providedName: string): void {
  if (providedName.trim().toLowerCase() !== ctx.name.trim().toLowerCase()) {
    throw new UnauthorizedError('system name does not match the authenticated API token');
  }
}

/** Sum quantities per finished-item id — an order may legitimately list the same variant twice. */
function aggregateLines(lines: Array<{ itemId: string; quantity: number }>): Map<string, number> {
  const byItem = new Map<string, number>();
  for (const line of lines) {
    byItem.set(line.itemId, (byItem.get(line.itemId) ?? 0) + line.quantity);
  }
  return byItem;
}

/** One `CONSUMPTION` movement to write: a stocked item, a quantity, the recipe it served (if any). */
interface PlannedConsumption {
  itemId: string;
  quantity: number;
  nomenclatureId: string | null;
}

export async function getExternalStock(ctx: ExternalSystemContext, query: ExternalStockQuery) {
  assertSystemName(ctx, query.system);
  const warehouse = await getWarehouseByCode(ctx.companyId, query.locationCode);

  // A stock-tracked item (raw or semi-finished) reports its own on-hand stock.
  // A non-stocked finished product reports its buildable count from its recipe.
  const resolved = await Promise.all(
    query.itemIds.map(async (id) => {
      const node = await getRecipeNode(ctx.companyId, id);
      const exploded =
        !node.item.isStockable && node.activeNomenclatureId !== null
          ? await explodeRequirements(ctx.companyId, node.item.id, 1)
          : null;
      return { node, exploded };
    }),
  );

  const stockIds = new Set<string>();
  for (const { node, exploded } of resolved) {
    if (exploded === null) stockIds.add(node.item.id);
    else for (const id of exploded.requirements.keys()) stockIds.add(id);
  }
  const onHand = new Map(
    (await getStockQuantities(warehouse.id, [...stockIds])).map((q) => [q.itemId, Number(q.quantity)]),
  );

  const items = resolved.map(({ node, exploded }) => {
    if (exploded === null) {
      return { itemId: node.item.id, quantity: (onHand.get(node.item.id) ?? 0).toString() };
    }
    // Buildable = how many whole units the scarcest component allows.
    let buildable = Infinity;
    for (const [componentId, perUnit] of exploded.requirements) {
      if (perUnit <= 0) continue;
      buildable = Math.min(buildable, Math.floor((onHand.get(componentId) ?? 0) / perUnit));
    }
    return { itemId: node.item.id, quantity: (Number.isFinite(buildable) ? buildable : 0).toString() };
  });

  return { locationCode: query.locationCode, warehouseId: warehouse.id, items };
}

export async function consumeStock(ctx: ExternalSystemContext, input: ConsumeInput) {
  assertSystemName(ctx, input.system);

  const warehouse = await getWarehouseByCode(ctx.companyId, input.locationCode);
  const aggregated = aggregateLines(input.lines);
  const finishedItemIds = [...aggregated.keys()];

  // Idempotency: a repeat of the same orderRef returns the original movements
  // and moves no stock.
  const existing = await findExternalMovements(ctx.id, input.orderRef, 'CONSUMPTION');
  if (existing.length > 0) {
    console.info(`[external] consume replay for orderRef=${input.orderRef} system=${ctx.name}`);
    return { orderRef: input.orderRef, replayed: true, movements: existing.map(toMovementResult) };
  }

  // Hard cutover: a non-stocked finished item must have an active recipe. (A
  // stock-tracked item with no recipe is fine — it's consumed directly.)
  const nodes = await Promise.all(finishedItemIds.map((id) => getRecipeNode(ctx.companyId, id)));
  const noRecipe = nodes
    .filter((n) => !n.item.isStockable && n.activeNomenclatureId === null)
    .map((n) => n.item.id);
  if (noRecipe.length > 0) {
    throw new RecipeMissingError(`No active recipe for item(s): ${noRecipe.join(', ')}`);
  }

  // Explode every line to the stocked items it draws down (stops at raw
  // materials AND already-produced semi-finished goods). One planned
  // CONSUMPTION per (finished item, stocked component); `totalPerComponent`
  // sums across the whole order for the up-front sufficiency check.
  const planned: PlannedConsumption[] = [];
  const totalPerComponent = new Map<string, number>();
  for (const [finishedItemId, qty] of aggregated) {
    const { topNomenclatureId, requirements } = await explodeRequirements(
      ctx.companyId,
      finishedItemId,
      qty,
    );
    for (const [componentId, need] of requirements) {
      planned.push({ itemId: componentId, quantity: need, nomenclatureId: topNomenclatureId });
      totalPerComponent.set(componentId, (totalPerComponent.get(componentId) ?? 0) + need);
    }
  }

  // Friendly pre-check so the 409 can name the short components. The
  // transaction below is still the real guard (recordStockMovement rejects a
  // negative level).
  const onHand = new Map(
    (await getStockQuantities(warehouse.id, [...totalPerComponent.keys()])).map((q) => [
      q.itemId,
      Number(q.quantity),
    ]),
  );
  const short = [...totalPerComponent]
    .filter(([componentId, need]) => (onHand.get(componentId) ?? 0) < need)
    .map(([componentId]) => componentId);
  if (short.length > 0) {
    throw new ConflictError(
      `Insufficient stock at "${input.locationCode}" for item(s): ${short.join(', ')}`,
    );
  }

  const movements = await db.transaction(async (tx) => {
    const created: StockMovementRow[] = [];
    for (const p of planned) {
      created.push(
        await recordStockMovement(tx, {
          type: 'CONSUMPTION',
          itemId: p.itemId,
          warehouseId: warehouse.id,
          quantity: p.quantity,
          createdByExternalSystemId: ctx.id,
          externalRef: input.orderRef,
          ...(p.nomenclatureId ? { nomenclatureId: p.nomenclatureId } : {}),
        }),
      );
    }
    return created;
  });

  return { orderRef: input.orderRef, replayed: false, movements: movements.map(toMovementResult) };
}

export async function releaseStock(ctx: ExternalSystemContext, input: ReleaseInput) {
  assertSystemName(ctx, input.system);

  const consumed = await findExternalMovements(ctx.id, input.orderRef, 'CONSUMPTION');
  if (consumed.length === 0) {
    throw new NotFoundError(`No consumption recorded for orderRef "${input.orderRef}"`);
  }

  const existing = await findExternalMovements(ctx.id, input.orderRef, 'RETURN');
  if (existing.length > 0) {
    return { orderRef: input.orderRef, replayed: true, movements: existing.map(toMovementResult) };
  }

  const movements = await db.transaction(async (tx) => {
    const created: StockMovementRow[] = [];
    for (const c of consumed) {
      created.push(
        await recordStockMovement(tx, {
          type: 'RETURN',
          itemId: c.itemId,
          warehouseId: c.warehouseId,
          quantity: Number(c.quantity),
          createdByExternalSystemId: ctx.id,
          externalRef: input.orderRef,
          ...(c.nomenclatureId ? { nomenclatureId: c.nomenclatureId } : {}),
        }),
      );
    }
    return created;
  });

  return { orderRef: input.orderRef, replayed: false, movements: movements.map(toMovementResult) };
}
