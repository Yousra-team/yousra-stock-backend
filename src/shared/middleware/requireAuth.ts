import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../jwt';
import { UnauthorizedError } from '../errors';

/**
 * Verifies the `Authorization: Bearer <token>` header, attaches
 * `req.user = { id, companyId, role }`, and rejects with 401 on anything
 * missing/invalid/expired. Mount before every protected route — this is
 * the ONLY place `companyId` should ever be trusted from; downstream code
 * must read `req.user.companyId`, never a client-supplied `companyId`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }

  try {
    req.user = verifyAuthToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  next();
}
