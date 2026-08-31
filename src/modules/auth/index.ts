// Public interface — other modules (e.g. `company`) call into these instead
// of touching the `User` table directly.
export { authRouter } from './auth.routes';
export { createUser, toPublicUser } from './auth.service';
export type { PublicUser } from './auth.service';
export { companyOwnerSchema } from './auth.schema';
export type { CompanyOwnerInput } from './auth.schema';
