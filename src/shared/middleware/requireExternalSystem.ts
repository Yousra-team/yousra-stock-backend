import type { NextFunction, Request, Response } from 'express';
import { findExternalSystemByToken } from '../../modules/integration';
import { UnauthorizedError } from '../errors';

/**
 * Service-to-service auth for the `/api/v1/external` surface — completely
 * separate from the human JWT in `requireAuth`.
 *
 * The caller presents its opaque token as `X-Api-Token`. On success this
 * attaches `req.externalSystem = { id, companyId, name }`; downstream code
 * scopes every query by `req.externalSystem.companyId`, never a
 * client-supplied `companyId`.
 *
 * The caller's own name (sent in the request body/query as `system`) is
 * cross-checked against the resolved row by each service function — a
 * mismatch is a 401, so a leaked token used under the wrong name still fails.
 */
export async function requireExternalSystem(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers['x-api-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || token.trim() === '') {
    throw new UnauthorizedError('Missing X-Api-Token header');
  }

  const system = await findExternalSystemByToken(token.trim());
  if (!system) {
    throw new UnauthorizedError('Invalid or revoked API token');
  }

  req.externalSystem = { id: system.id, companyId: system.companyId, name: system.name };
  next();
}
