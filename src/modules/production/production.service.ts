import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { ConflictError } from '../../shared/errors';
import { getItemById } from '../catalog';
import { getWarehouseById } from '../warehouses';
import { explodeProductionInputs } from '../nomenclature';
import { getStockQuantities, recordStockMovement } from '../stock';
import type { CreateProductionInput } from './production.schema';

type StockMovementRow = FieldOutputTypes['public']['StockMovement'];

export interface ProductionResult {
  /** The `PRODUCTION` movement that added the finished batch. */
  produced: StockMovementRow;
  /** One `CONSUMPTION` movement per stocked recipe component drawn down. */
  consumed: StockMovementRow[];
}

/**
 * Records a production run: `quantity` units of `itemId` are built from its
 * active recipe at `warehouseId`. The recipe is exploded to its stocked inputs
 * (raw materials and already-produced semi-finished goods — a sub-recipe is
 * only followed for a non-stocked phantom), those are consumed, and the
 * produced units are added. All in one transaction.
 */
export async function recordProduction(
  companyId: string,
  createdBy: string,
  input: CreateProductionInput,
): Promise<ProductionResult> {
  await getWarehouseById(companyId, input.warehouseId);
  await getItemById(companyId, input.itemId);

  const { nomenclatureId, inputs } = await explodeProductionInputs(
    companyId,
    input.itemId,
    input.quantity,
  );

  // Friendly pre-check so the 409 can name the short inputs. The transaction
  // below is still the real guard (recordStockMovement rejects a negative level).
  const onHand = new Map(
    (await getStockQuantities(input.warehouseId, [...inputs.keys()])).map((q) => [
      q.itemId,
      Number(q.quantity),
    ]),
  );
  const short = [...inputs]
    .filter(([itemId, need]) => (onHand.get(itemId) ?? 0) < need)
    .map(([itemId]) => itemId);
  if (short.length > 0) {
    throw new ConflictError(`Insufficient stock to produce this batch — short on item(s): ${short.join(', ')}`);
  }

  return db.transaction(async (tx) => {
    const consumed: StockMovementRow[] = [];
    for (const [componentId, need] of inputs) {
      consumed.push(
        await recordStockMovement(tx, {
          type: 'CONSUMPTION',
          itemId: componentId,
          warehouseId: input.warehouseId,
          quantity: need,
          nomenclatureId,
          createdBy,
        }),
      );
    }

    const produced = await recordStockMovement(tx, {
      type: 'PRODUCTION',
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      nomenclatureId,
      createdBy,
    });

    return { produced, consumed };
  });
}
