import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  id: string;
  companyId: string;
  role: string;
}

const JWT_EXPIRES_IN = '12h';

function getSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/** Throws `jsonwebtoken`'s own errors (e.g. `TokenExpiredError`, `JsonWebTokenError`) on an invalid/expired token — callers decide how to translate them. */
export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getSecret()) as AuthTokenPayload;
}
