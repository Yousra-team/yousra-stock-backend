import type { AuthTokenPayload } from './jwt';

/** Shape `requireExternalSystem` attaches for the service-to-service auth path. */
export interface ExternalSystemContext {
  id: string;
  companyId: string;
  name: string;
}

// Augments Express's Request with the shape `requireAuth` attaches.
// Every module reads the authenticated company/user from `req.user` — never
// from the request body — per the companyId-server-derivation rule.
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      /**
       * Set by `requireExternalSystem` — the authenticated external API
       * consumer (Pizzaland, etc.). `companyId` here is derived from the
       * `ExternalSystem` row, never from the request, exactly as `req.user`
       * is for human callers.
       */
      externalSystem?: ExternalSystemContext;
      /**
       * Set by `validateQuery` — the parsed/coerced query object. Express 5
       * made `req.query` a getter that re-parses the raw URL on every
       * access (no stable object to mutate in place), so validated query
       * data lives here instead; read `req.validatedQuery`, not `req.query`,
       * on any route behind `validateQuery`.
       */
      validatedQuery?: unknown;
    }
  }
}

export {};
