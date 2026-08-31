/**
 * Typed application errors. Thrown from services/controllers, caught by
 * `shared/errorHandler.ts`, and rendered into the `{ error: { message, code } }`
 * envelope. Prefer throwing one of these over a bare `throw new Error(...)`
 * so the HTTP status code travels with the error.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request') {
    super(400, 'BAD_REQUEST', message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, 'CONFLICT', message);
  }
}
