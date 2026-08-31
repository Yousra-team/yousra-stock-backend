import { z } from 'zod';

export const createExternalSystemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  phone: z.string().min(1),
});
export type CreateExternalSystemInput = z.infer<typeof createExternalSystemSchema>;
