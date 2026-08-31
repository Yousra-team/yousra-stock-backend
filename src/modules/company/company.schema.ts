import { z } from 'zod';
import { companyOwnerSchema } from '../auth';

/** `POST /companies` — public. Creates the tenant + its first (Admin) user in one call. */
export const createCompanySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  owner: companyOwnerSchema,
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
}).partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
