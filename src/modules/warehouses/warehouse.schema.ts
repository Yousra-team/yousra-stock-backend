import { z } from 'zod';

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  /** Short handle external systems use to address this warehouse (unique per company). */
  code: z.string().min(1).optional(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = z.object({
  name: z.string().min(1).optional(),
  /** `null` clears the code. */
  code: z.string().min(1).nullable().optional(),
});
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
