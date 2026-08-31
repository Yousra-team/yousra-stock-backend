import { z } from 'zod';
import { positiveDecimal } from '../../shared/zodDecimal';

export const unitFamilySchema = z.enum(['MASS', 'VOLUME', 'UNIT']);

export const createUnitSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  family: unitFamilySchema,
  factorToBase: positiveDecimal,
  isBase: z.boolean(),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  family: unitFamilySchema,
  factorToBase: positiveDecimal,
  isBase: z.boolean(),
}).partial();
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export const convertQuerySchema = z.object({
  fromUnitId: z.uuid(),
  toUnitId: z.uuid(),
  quantity: z.coerce.number().finite().positive(),
});
export type ConvertQuery = z.infer<typeof convertQuerySchema>;
