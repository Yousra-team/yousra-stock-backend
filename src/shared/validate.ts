import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Validates `req.body` against `schema` with `safeParse` (runtime check —
 * TypeScript types on `req.body` are compile-time only and don't protect
 * against a malicious/malformed client). On success, replaces `req.body`
 * with the parsed (and defaulted/coerced) value. On failure, responds 400
 * with the standard error envelope and never calls the route handler.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: result.error.flatten(),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Same as `validateBody`, but for `req.query` (e.g. pagination / filter
 * params). Express 5's `req.query` is a getter that re-parses the raw URL
 * on every access — there's no stable object to reassign or mutate in
 * place — so the parsed/coerced result is stashed on `req.validatedQuery`
 * instead. Read `req.validatedQuery` in the controller, not `req.query`.
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: result.error.flatten(),
        },
      });
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
