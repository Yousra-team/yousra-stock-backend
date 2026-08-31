import { z } from 'zod';
import type { PaginationMeta } from './response';

/**
 * `?page=&pageSize=` — apply with `validateQuery` on every list route.
 * Defaults and the `pageSize` cap live here, once — `parsePagination` below
 * just turns the already-validated numbers into offset/limit, rather than
 * re-validating a second time.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** Turns an already-`validateQuery(paginationQuerySchema)`-validated `{ page, pageSize }` into offset/limit. */
export function parsePagination(query: PaginationQuery): PaginationParams {
  return {
    page: query.page,
    pageSize: query.pageSize,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function buildMeta(params: PaginationParams, total: number): PaginationMeta {
  return { page: params.page, pageSize: params.pageSize, total };
}
