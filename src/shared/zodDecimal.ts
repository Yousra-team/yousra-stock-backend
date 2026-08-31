import { z } from 'zod';

/**
 * `Decimal`-typed contract fields (`factorToBase`, `quantity`, `unitCost`,
 * `amount`, ...) take a `string` at the ORM layer (precision, not a JS
 * float). These accept a number or numeric string from the client, validate
 * it, and transform to the string the ORM expects.
 */
export const positiveDecimal = z.coerce.number().finite().positive().transform((n) => n.toString());
export const nonNegativeDecimal = z.coerce.number().finite().nonnegative().transform((n) => n.toString());
