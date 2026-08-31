import { z } from 'zod';
import { positiveDecimal } from '../../shared/zodDecimal';

export const purchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);

export const purchaseOrderItemInputSchema = z.object({
  itemId: z.uuid(),
  unitCost: positiveDecimal,
  quantity: positiveDecimal,
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;

export const createPurchaseOrderSchema = z.object({
  supplierId: z.uuid(),
  warehouseId: z.uuid(),
  expectedAt: z.iso.datetime(),
  status: purchaseOrderStatusSchema.optional(),
  items: z.array(purchaseOrderItemInputSchema).min(1),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

/** `PATCH /purchases/:id` is status-only, per the brief. */
export const updatePurchaseOrderStatusSchema = z.object({
  status: purchaseOrderStatusSchema,
});
export type UpdatePurchaseOrderStatusInput = z.infer<typeof updatePurchaseOrderStatusSchema>;
