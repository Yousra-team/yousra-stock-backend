import { z } from 'zod';

export const userRoleSchema = z.enum(['Admin', 'Manager', 'Staff']);

/** `POST /auth/user` — protected; adds a teammate to the caller's own company. */
export const registerUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1),
  role: userRoleSchema,
  password: z.string().min(8),
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

/** The owner fields nested inside `POST /companies` — same shape minus `role` (owner is always `Admin`). */
export const companyOwnerSchema = registerUserSchema.omit({ role: true });
export type CompanyOwnerInput = z.infer<typeof companyOwnerSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
