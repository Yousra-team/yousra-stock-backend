import { z } from 'zod';
import { nonNegativeDecimal } from '../../shared/zodDecimal';

export const createItemSchema = z.object({
  name: z.string().min(1),
  categoryId: z.uuid(),
  baseUnitId: z.uuid(),
  isStockable: z.boolean(),
  isBuyable: z.boolean(),
  reorderThreshold: nonNegativeDecimal.optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z.object({
  name: z.string().min(1),
  categoryId: z.uuid(),
  baseUnitId: z.uuid(),
  isStockable: z.boolean(),
  isBuyable: z.boolean(),
  reorderThreshold: nonNegativeDecimal,
}).partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
