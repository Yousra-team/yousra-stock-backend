import { z } from 'zod';
import { positiveDecimal } from '../../shared/zodDecimal';

export const nomenclatureLineInputSchema = z.object({
  subItemId: z.uuid(),
  quantity: positiveDecimal,
  unitId: z.uuid(),
});
export type NomenclatureLineInput = z.infer<typeof nomenclatureLineInputSchema>;

export const createNomenclatureSchema = z.object({
  itemId: z.uuid(),
  notes: z.string().optional(),
  lines: z.array(nomenclatureLineInputSchema).min(1),
});
export type CreateNomenclatureInput = z.infer<typeof createNomenclatureSchema>;

/** `PATCH /nomenclature/:id` only ever touches `notes` — lines/version/isActive changes go through create-new-version / activate. */
export const updateNomenclatureSchema = z.object({
  notes: z.string().nullable().optional(),
});
export type UpdateNomenclatureInput = z.infer<typeof updateNomenclatureSchema>;
