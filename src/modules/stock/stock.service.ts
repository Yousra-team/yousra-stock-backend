import { db, type Tx } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import { allocateDocumentReference } from '../../shared/documentNumber';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getWarehouseById } from '../warehouses';
import { getItemById } from '../catalog';
import { getNomenclatureById } from '../nomenclature';
import type { CreateStockMovementInput } from './stock.schema';

type StockLevelRow = FieldOutputTypes['public']['StockLevel'];
type StockMovementRow = FieldOutputTypes['public']['StockMovement'];
type StockMovementType = StockMovementRow['type'];

export interface RecordMovementParams {
  type: StockMovementType;
  itemId: string;
  warehouseId: string;
  /** Always positive — direction comes from `type` (and `adjustmentDirection` for `ADJUSTMENT`). */
  quantity: number;
  /** Set for human-initiated movements. Exactly one of `createdBy` / `createdByExternalSystemId` must be provided. */
  createdBy?: string;
  /** Set for `SALE` / `RETURN` movements initiated by an external system (Pizzaland). */
  createdByExternalSystemId?: string;
  /** The originating external order's reference — only meaningful with `createdByExternalSystemId`. */
  externalRef?: string;
  reason?: StockMovementRow['reason'];
  nomenclatureId?: string;
  receiptItemId?: string;
  transferItemId?: string;
  /** Required (and only meaningful) when `type === 'ADJUSTMENT'` — see the contract comment on `StockMovement`. */
  adjustmentDirection?: 'increase' | 'decrease';
}

function resolveDelta(params: RecordMovementParams): number {
  if (params.type === 'STOCK_IN' || params.type === 'TRANSFER_IN' || params.type === 'RETURN') {
    return params.quantity;
  }
  if (
    params.type === 'CONSUMPTION' ||
    params.type === 'MANUAL_OUT' ||
    params.type === 'TRANSFER_OUT' ||
    params.type === 'SALE'
  ) {
    return -params.quantity;
  }
  if (params.type === 'ADJUSTMENT') {
    if (!params.adjustmentDirection) {
      throw new BadRequestError('adjustmentDirection is required for ADJUSTMENT movements');
    }
    return params.adjustmentDirection === 'increase' ? params.quantity : -params.quantity;
  }
  throw new BadRequestError(`Unknown stock movement type: ${String(params.type)}`);
}

/**
 * The single choke point for every stock-affecting write: updates (or
 * creates) the `StockLevel` row and appends the `StockMovement` ledger
 * entry, atomically, inside the caller's transaction. Every other module
 * that moves stock (goods receipts, BOM consumption, manual movements)
 * calls this instead of touching `StockLevel` / `StockMovement` directly.
 */
export async function recordStockMovement(tx: Tx, params: RecordMovementParams): Promise<StockMovementRow> {
  const hasUser = params.createdBy != null;
  const hasSystem = params.createdByExternalSystemId != null;
  if (hasUser === hasSystem) {
    throw new BadRequestError(
      'Exactly one of createdBy / createdByExternalSystemId must be set on a stock movement',
    );
  }

  const delta = resolveDelta(params);

  const existingLevel = await tx.orm.public.StockLevel
    .where((sl) => sl.itemId.eq(params.itemId))
    .where((sl) => sl.warehouseId.eq(params.warehouseId))
    .first();

  const currentQuantity = existingLevel ? Number(existingLevel.quantity) : 0;
  const newQuantity = currentQuantity + delta;
  if (newQuantity < 0) {
    throw new ConflictError('Insufficient stock for this movement');
  }

  if (existingLevel) {
    await tx.orm.public.StockLevel
      .where((sl) => sl.id.eq(existingLevel.id))
      .update({ quantity: newQuantity.toString() });
  } else {
    await tx.orm.public.StockLevel.create({
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      quantity: newQuantity.toString(),
    });
  }

  return tx.orm.public.StockMovement.create({
    reference: await allocateDocumentReference(tx, 'SM'),
    type: params.type,
    itemId: params.itemId,
    warehouseId: params.warehouseId,
    quantity: params.quantity.toString(),
    reason: params.reason ?? null,
    nomenclatureId: params.nomenclatureId ?? null,
    receiptItemId: params.receiptItemId ?? null,
    transferItemId: params.transferItemId ?? null,
    createdBy: params.createdBy ?? null,
    createdByExternalSystemId: params.createdByExternalSystemId ?? null,
    externalRef: params.externalRef ?? null,
  });
}

async function companyWarehouseIds(companyId: string): Promise<string[]> {
  const warehouses = await db.orm.public.Warehouse.where((w) => w.companyId.eq(companyId)).select('id').all();
  return warehouses.map((w) => w.id);
}

export async function listStockLevels(companyId: string, pagination: PaginationParams) {
  const warehouseIds = await companyWarehouseIds(companyId);
  if (warehouseIds.length === 0) {
    return { items: [], meta: buildMeta(pagination, 0) };
  }

  const [items, { total }] = await Promise.all([
    db.orm.public.StockLevel
      .where((sl) => sl.warehouseId.in(warehouseIds))
      .include('item', (it) => it.select('id', 'name'))
      .include('warehouse', (w) => w.select('id', 'name'))
      .orderBy((sl) => sl.updatedAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.StockLevel.where((sl) => sl.warehouseId.in(warehouseIds)).aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

/** `StockLevel` is a lazily-materialized read model — a pair with no movements yet legitimately has zero stock, not a 404. */
export async function getStockLevel(
  companyId: string,
  warehouseId: string,
  itemId: string,
) {
  const warehouse = await getWarehouseById(companyId, warehouseId);
  const item = await getItemById(companyId, itemId);

  const level = await db.orm.public.StockLevel
    .where((sl) => sl.warehouseId.eq(warehouseId))
    .where((sl) => sl.itemId.eq(itemId))
    .include('item', (it) => it.select('id', 'name'))
    .include('warehouse', (w) => w.select('id', 'name'))
    .first();

  // A pair with no movements yet has no row — return a synthetic zero level with
  // the same populated shape as a real one.
  return (
    level ?? {
      itemId,
      warehouseId,
      quantity: '0',
      item: { id: item.id, name: item.name },
      warehouse: { id: warehouse.id, name: warehouse.name },
    }
  );
}

export async function listStockMovements(companyId: string, pagination: PaginationParams) {
  const warehouseIds = await companyWarehouseIds(companyId);
  if (warehouseIds.length === 0) {
    return { items: [], meta: buildMeta(pagination, 0) };
  }

  const [items, { total }] = await Promise.all([
    db.orm.public.StockMovement
      .where((sm) => sm.warehouseId.in(warehouseIds))
      .include('item', (it) => it.select('id', 'name'))
      .include('warehouse', (w) => w.select('id', 'name'))
      .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
      .include('createdByExternalSystem', (es) => es.select('id', 'name'))
      .include('nomenclature', (n) => n.select('id', 'version', 'isActive'))
      .include('receiptItem', (ri) => ri.select('id', 'itemId'))
      .include('transferItem', (ti) => ti.select('id', 'itemId'))
      .orderBy((sm) => sm.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.StockMovement.where((sm) => sm.warehouseId.in(warehouseIds)).aggregate((a) => ({
      total: a.count(),
    })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getStockMovementById(companyId: string, id: string): Promise<StockMovementRow> {
  const movement = await db.orm.public.StockMovement
    .where((sm) => sm.id.eq(id))
    .include('item', (it) => it.select('id', 'name'))
    .include('warehouse', (w) => w.select('id', 'name'))
    .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
    .include('createdByExternalSystem', (es) => es.select('id', 'name'))
    .include('nomenclature', (n) => n.select('id', 'version', 'isActive'))
    .include('receiptItem', (ri) => ri.select('id', 'itemId'))
    .include('transferItem', (ti) => ti.select('id', 'itemId'))
    .first();
  if (!movement) {
    throw new NotFoundError('Stock movement not found');
  }
  await getWarehouseById(companyId, movement.warehouseId);
  return movement;
}

export async function createStockMovement(
  companyId: string,
  createdBy: string,
  input: CreateStockMovementInput,
): Promise<StockMovementRow> {
  await getWarehouseById(companyId, input.warehouseId);
  await getItemById(companyId, input.itemId);

  if (input.type === 'CONSUMPTION') {
    await getNomenclatureById(companyId, input.nomenclatureId);
  }

  return db.transaction((tx) => {
    if (input.type === 'CONSUMPTION') {
      return recordStockMovement(tx, {
        type: 'CONSUMPTION',
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        createdBy,
        nomenclatureId: input.nomenclatureId,
      });
    }
    if (input.type === 'MANUAL_OUT') {
      return recordStockMovement(tx, {
        type: 'MANUAL_OUT',
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        createdBy,
        reason: input.reason,
      });
    }
    return recordStockMovement(tx, {
      type: 'ADJUSTMENT',
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      createdBy,
      adjustmentDirection: input.direction,
    });
  });
}

/**
 * Current quantity for each of `itemIds` in one warehouse. An item with no
 * `StockLevel` row yet reports `"0"` (same lazily-materialized read model as
 * `getStockLevel`). Callers must have already checked the warehouse + items
 * belong to their tenant.
 */
export async function getStockQuantities(
  warehouseId: string,
  itemIds: string[],
): Promise<Array<{ itemId: string; quantity: string }>> {
  if (itemIds.length === 0) {
    return [];
  }

  const levels = await db.orm.public.StockLevel
    .where((sl) => sl.warehouseId.eq(warehouseId))
    .where((sl) => sl.itemId.in(itemIds))
    .select('itemId', 'quantity')
    .all();

  const byItem = new Map(levels.map((l) => [l.itemId, l.quantity]));
  return itemIds.map((itemId) => ({ itemId, quantity: byItem.get(itemId) ?? '0' }));
}

/**
 * The `SALE` / `RETURN` movements a given external system already recorded for
 * one order reference. The `external` module uses this for replay detection —
 * a second `consume` / `release` for the same `orderRef` returns these instead
 * of moving stock again.
 */
export async function findExternalMovements(
  externalSystemId: string,
  externalRef: string,
  type: 'SALE' | 'RETURN',
): Promise<StockMovementRow[]> {
  return db.orm.public.StockMovement
    .where((sm) => sm.createdByExternalSystemId.eq(externalSystemId))
    .where((sm) => sm.externalRef.eq(externalRef))
    .where((sm) => sm.type.eq(type))
    .orderBy((sm) => sm.createdAt.asc())
    .all();
}
