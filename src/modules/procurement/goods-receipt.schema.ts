import { z } from 'zod';
import { positiveDecimal } from '../../shared/zodDecimal';

export const goodsReceiptItemInputSchema = z.object({
  itemId: z.uuid(),
  unitCost: positiveDecimal,
  quantity: positiveDecimal,
});
export type GoodsReceiptItemInput = z.infer<typeof goodsReceiptItemInputSchema>;

/**
 * `supplierId` / `warehouseId` are NOT accepted here — they're derived
 * server-side from the referenced `purchaseOrderId` so a receipt can never
 * disagree with the order it's fulfilling.
 */
export const createGoodsReceiptSchema = z.object({
  purchaseOrderId: z.uuid(),
  receivedAt: z.iso.datetime(),
  items: z.array(goodsReceiptItemInputSchema).min(1),
});
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
