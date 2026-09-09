import { z } from 'zod';

/**
 * Record that a batch of a made item (finished or semi-finished) was produced.
 * Draws down the recipe's stocked components as `CONSUMPTION` and adds the
 * produced units with one `PRODUCTION` movement.
 */
export const createProductionSchema = z.object({
  itemId: z.uuid(),
  warehouseId: z.uuid(),
  quantity: z.coerce.number().finite().positive(),
});
export type CreateProductionInput = z.infer<typeof createProductionSchema>;
