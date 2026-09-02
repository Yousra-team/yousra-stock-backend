import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import type { ExternalSystemContext } from '../../shared/request-context';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../shared/errors';
import { getItemById } from '../catalog';
import { getWarehouseByCode } from '../warehouses';
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

/** Every itemId must be a live catalog item in the caller's company. */
async function assertItemsInCompany(companyId: string, itemIds: string[]): Promise<void> {
  await Promise.all(itemIds.map((id) => getItemById(companyId, id)));
}

/** Sum quantities per itemId — an order may legitimately list the same item twice. */
function aggregateLines(lines: Array<{ itemId: string; quantity: number }>): Map<string, number> {
  const byItem = new Map<string, number>();
  for (const line of lines) {
    byItem.set(line.itemId, (byItem.get(line.itemId) ?? 0) + line.quantity);
  }
  return byItem;
}

function canonicalLines(entries: Array<{ itemId: string; quantity: number | string }>): string {
  return entries
    .map((e) => `${e.itemId}:${Number(e.quantity)}`)
    .sort()
    .join(',');
}

export async function getExternalStock(ctx: ExternalSystemContext, query: ExternalStockQuery) {
  assertSystemName(ctx, query.system);
  const warehouse = await getWarehouseByCode(ctx.companyId, query.locationCode);
  await assertItemsInCompany(ctx.companyId, query.itemIds);

  const quantities = await getStockQuantities(warehouse.id, query.itemIds);
  return { locationCode: query.locationCode, warehouseId: warehouse.id, items: quantities };
}

export async function consumeStock(ctx: ExternalSystemContext, input: ConsumeInput) {
  assertSystemName(ctx, input.system);

  const warehouse = await getWarehouseByCode(ctx.companyId, input.locationCode);
  const aggregated = aggregateLines(input.lines);
  const itemIds = [...aggregated.keys()];
  await assertItemsInCompany(ctx.companyId, itemIds);

  // Idempotency: a repeat of the same orderRef returns the original movements
  // and moves no stock. A repeat carrying a *different* payload is still
  // treated as a replay (the first call wins) but is logged.
  const existing = await findExternalMovements(ctx.id, input.orderRef, 'SALE');
  if (existing.length > 0) {
    const incoming = canonicalLines([...aggregated].map(([itemId, quantity]) => ({ itemId, quantity })));
    const recorded = canonicalLines(existing.map((m) => ({ itemId: m.itemId, quantity: m.quantity })));
    if (incoming !== recorded) {
      console.warn(
        `[external] consume replay for orderRef=${input.orderRef} system=${ctx.name} ignored a changed payload ` +
          `(recorded: ${recorded}; incoming: ${incoming})`,
      );
    }
    return { orderRef: input.orderRef, replayed: true, movements: existing.map(toMovementResult) };
  }

  // Friendly pre-check so the 409 can name the short items. The transaction
  // below is still the real guard (recordStockMovement rejects a negative level).
  const onHand = new Map(
    (await getStockQuantities(warehouse.id, itemIds)).map((q) => [q.itemId, Number(q.quantity)]),
  );
  const short = [...aggregated]
    .filter(([itemId, qty]) => (onHand.get(itemId) ?? 0) < qty)
    .map(([itemId]) => itemId);
  if (short.length > 0) {
    throw new ConflictError(`Insufficient stock at "${input.locationCode}" for item(s): ${short.join(', ')}`);
  }

  const movements = await db.transaction(async (tx) => {
    const created: StockMovementRow[] = [];
    for (const [itemId, quantity] of aggregated) {
      created.push(
        await recordStockMovement(tx, {
          type: 'SALE',
          itemId,
          warehouseId: warehouse.id,
          quantity,
          createdByExternalSystemId: ctx.id,
          externalRef: input.orderRef,
        }),
      );
    }
    return created;
  });

  return { orderRef: input.orderRef, replayed: false, movements: movements.map(toMovementResult) };
}

export async function releaseStock(ctx: ExternalSystemContext, input: ReleaseInput) {
  assertSystemName(ctx, input.system);

  const sales = await findExternalMovements(ctx.id, input.orderRef, 'SALE');
  if (sales.length === 0) {
    throw new NotFoundError(`No consumption recorded for orderRef "${input.orderRef}"`);
  }

  const existing = await findExternalMovements(ctx.id, input.orderRef, 'RETURN');
  if (existing.length > 0) {
    return { orderRef: input.orderRef, replayed: true, movements: existing.map(toMovementResult) };
  }

  const movements = await db.transaction(async (tx) => {
    const created: StockMovementRow[] = [];
    for (const sale of sales) {
      created.push(
        await recordStockMovement(tx, {
          type: 'RETURN',
          itemId: sale.itemId,
          warehouseId: sale.warehouseId,
          quantity: Number(sale.quantity),
          createdByExternalSystemId: ctx.id,
          externalRef: input.orderRef,
        }),
      );
    }
    return created;
  });

  return { orderRef: input.orderRef, replayed: false, movements: movements.map(toMovementResult) };
}
