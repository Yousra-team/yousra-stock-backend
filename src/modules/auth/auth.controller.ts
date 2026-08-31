import type { Request, Response } from 'express';
import { db } from '../../prisma/db';
import { ForbiddenError } from '../../shared/errors';
import { signAuthToken } from '../../shared/jwt';
import { sendCreated, sendData } from '../../shared/response';
import { createUser, toPublicUser, verifyCredentials } from './auth.service';
import type { LoginInput, RegisterUserInput } from './auth.schema';

/**
 * `POST /auth/user` — protected; adds a teammate to the caller's own company.
 * Admin-only: this is the one place role escalation would otherwise be
 * possible (the request body carries its own `role`, including `Admin`) —
 * requiring the caller to already be an Admin is the minimum gate needed to
 * close that hole, without building out the full RBAC system the brief
 * defers to a later pass.
 */
export async function register(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'Admin') {
    throw new ForbiddenError('Only an Admin can add teammates');
  }

  const body = req.body as RegisterUserInput;
  const companyId = req.user!.companyId;

  const user = await db.transaction((tx) => createUser(tx, { ...body, companyId }));
  sendCreated(res, toPublicUser(user));
}

/** `POST /auth/login` — public. */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  const user = await verifyCredentials(email, password);
  const token = signAuthToken({ id: user.employeeId, companyId: user.companyId, role: user.role });

  sendData(res, { user: toPublicUser(user), token });
}
