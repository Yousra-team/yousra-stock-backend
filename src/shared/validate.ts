import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';

/** `["type: Invalid option ...", "isBase: expected boolean, received string"]` — readable per-field summary. */
function summarize(error: ZodError): string {
  const parts = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return parts.length > 0 ? `Validation failed — ${parts.join('; ')}` : 'Validation failed';
}

function respondInvalid(res: Response, error: ZodError): void {
  res.status(400).json({
    error: {
      message: summarize(error),
      code: 'VALIDATION_ERROR',
      details: error.flatten(),
    },
  });
}

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
      respondInvalid(res, result.error);
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
      respondInvalid(res, result.error);
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
