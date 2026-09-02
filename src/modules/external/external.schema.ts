import { z } from 'zod';

const systemName = z.string().min(1);
const locationCode = z.string().min(1);

/**
 * `GET /external/stock` — batch stock read.
 * `itemIds` is a comma-separated list of Yousra Item UUIDs in the query string.
 */
export const externalStockQuerySchema = z.object({
  system: systemName,
  locationCode,
  itemIds: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(100)),
});
export type ExternalStockQuery = z.infer<typeof externalStockQuerySchema>;

const orderLine = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().finite().positive(),
});

/** `POST /external/stock/consume` — an external order was confirmed. */
export const consumeSchema = z.object({
  system: systemName,
  /** The external order's own reference — the idempotency key. */
  orderRef: z.string().min(1),
  locationCode,
  lines: z.array(orderLine).min(1),
});
export type ConsumeInput = z.infer<typeof consumeSchema>;

/** `POST /external/stock/release` — a previously-consumed external order was cancelled. */
export const releaseSchema = z.object({
  system: systemName,
  orderRef: z.string().min(1),
});
export type ReleaseInput = z.infer<typeof releaseSchema>;
