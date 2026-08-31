import { z } from 'zod';

export const stockMovementReasonSchema = z.enum(['WASTE', 'SPOILAGE', 'INTERNAL_USE', 'THEFT', 'OTHER']);

const baseMovementFields = {
  itemId: z.uuid(),
  warehouseId: z.uuid(),
  quantity: z.coerce.number().finite().positive(),
};

/**
 * Only the movement types a human/API caller can trigger directly:
 * - `STOCK_IN` only ever happens via a goods receipt (`procurement` module).
 * - `TRANSFER_IN` / `TRANSFER_OUT` belong to the warehouse-transfer workflow,
 *   which is schema-only for this MVP pass (see the contract comment on
 *   `WarehouseTransfer`) — not reachable through this endpoint yet.
 */
export const createStockMovementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONSUMPTION'), ...baseMovementFields, nomenclatureId: z.uuid() }),
  z.object({ type: z.literal('MANUAL_OUT'), ...baseMovementFields, reason: stockMovementReasonSchema }),
  z.object({ type: z.literal('ADJUSTMENT'), ...baseMovementFields, direction: z.enum(['increase', 'decrease']) }),
]);
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
