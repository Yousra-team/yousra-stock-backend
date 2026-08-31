import { z } from 'zod';

export const supplierTypeSchema = z.enum(['COMPANY', 'INDIVIDUAL']);

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  description: z.string().optional(),
  phone: z.string().min(1),
  email: z.email(),
  type: supplierTypeSchema,
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
