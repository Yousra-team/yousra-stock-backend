import bcrypt from 'bcryptjs';
import { db, type Tx } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { ConflictError, UnauthorizedError } from '../../shared/errors';
import { isUniqueViolation } from '../../shared/dbErrors';
import type { RegisterUserInput } from './auth.schema';

type UserRow = FieldOutputTypes['public']['User'];
export type PublicUser = Omit<UserRow, 'passwordHash'>;

const BCRYPT_ROUNDS = 10;

export function toPublicUser(user: UserRow): PublicUser {
  const { passwordHash, ...publicUser } = user;
  void passwordHash;
  return publicUser;
}

/**
 * Creates a User row. Takes a `tx` so callers can fold this into a larger
 * transaction (e.g. `POST /companies` creating the company + its first
 * admin user atomically) — see `modules/company/company.service.ts`.
 */
export async function createUser(
  tx: Tx,
  input: RegisterUserInput & { companyId: string },
): Promise<UserRow> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    return await tx.orm.public.User.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash,
      companyId: input.companyId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('A user with this email already exists for this company');
    }
    throw err;
  }
}

/**
 * `email` is unique per company, not globally (`@@unique([companyId, email])`),
 * so a login can legitimately match more than one row if two different
 * companies happen to share an email. Compare the password against every
 * match and return whichever one it verifies against.
 */
export async function verifyCredentials(email: string, password: string): Promise<UserRow> {
  const candidates = await db.orm.public.User.where((u) => u.email.eq(email)).all();

  for (const candidate of candidates) {
    if (await bcrypt.compare(password, candidate.passwordHash)) {
      return candidate;
    }
  }

  throw new UnauthorizedError('Invalid email or password');
}
