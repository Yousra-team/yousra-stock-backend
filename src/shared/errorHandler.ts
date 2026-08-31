import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors';

/** Catch-all 404 — mounted after all routers, before `errorHandler`. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `No route for ${req.method} ${req.path}`, code: 'NOT_FOUND' },
  });
}

/**
 * Express error-handling middleware — must be mounted last, after every
 * router. Four-arg signature is load-bearing: Express only treats a
 * middleware as an error handler when it declares exactly four params.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
}
