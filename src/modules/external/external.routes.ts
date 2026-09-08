import { Router } from 'express';
import { requireExternalSystem } from '../../shared/middleware/requireExternalSystem';
import { validateBody, validateQuery } from '../../shared/validate';
import * as controller from './external.controller';
import { consumeSchema, externalStockQuerySchema, releaseSchema } from './external.schema';

export const externalRouter = Router();

// Service-to-service auth (API token), NOT the human JWT in `requireAuth`.
externalRouter.use(requireExternalSystem);

/**
 * @openapi
 * /external/stock:
 *   get:
 *     tags: [External]
 *     summary: Available quantity for a set of items at one location (batch)
 *     description: >
 *       `companyId` is derived from the API token. `itemIds` are Yousra Item
 *       UUIDs. For an item that has an active recipe (a finished product),
 *       `quantity` is the **buildable** count — how many whole units its
 *       current ingredient stock allows (min across the recipe). For a raw
 *       ingredient item, `quantity` is that item's own on-hand stock; an item
 *       with no movements yet reports `"0"`.
 *     security: [{ apiTokenAuth: [] }]
 *     parameters:
 *       - { in: query, name: system, required: true, schema: { type: string }, description: Caller's registered name; must match the token. }
 *       - { in: query, name: locationCode, required: true, schema: { type: string }, description: Warehouse code (e.g. pizzaland001). }
 *       - { in: query, name: itemIds, required: true, schema: { type: string }, description: Comma-separated Yousra Item UUIDs (max 100). }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     locationCode: { type: string }
 *                     warehouseId: { type: string, format: uuid }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId: { type: string, format: uuid }
 *                           quantity: { type: string, example: '42' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
externalRouter.get('/stock', validateQuery(externalStockQuerySchema), controller.getStock);

/**
 * @openapi
 * /external/stock/consume:
 *   post:
 *     tags: [External]
 *     summary: An external order was confirmed — consume recipe ingredients
 *     description: >
 *       `lines[].itemId` is a finished product. Yousra loads its active recipe,
 *       explodes it recursively to raw ingredients, and writes one `CONSUMPTION`
 *       movement per ingredient (attributed to the calling external system, not
 *       a user). Atomic — insufficient stock for any ingredient rolls the whole
 *       call back with a 409 naming the short ingredient(s). Idempotent on
 *       `orderRef`: a repeat returns the original movements with status 200 and
 *       moves no stock. A finished item with no active recipe returns 409 with
 *       `code: "NO_RECIPE"`.
 *     security: [{ apiTokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ExternalConsumeInput' }
 *     responses:
 *       201: { description: Ingredients consumed }
 *       200: { description: "Replay — original movements returned, no change" }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: >
 *           Insufficient ingredient stock (`code: "CONFLICT"`), or a finished
 *           item has no active recipe (`code: "NO_RECIPE"`), or the recipe is
 *           misconfigured — cycle / too deep / non-stock ingredient
 *           (`code: "CONFLICT"`). Nothing is written.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
externalRouter.post('/stock/consume', validateBody(consumeSchema), controller.consume);

/**
 * @openapi
 * /external/stock/release:
 *   post:
 *     tags: [External]
 *     summary: A previously-consumed external order was cancelled — restore its ingredients
 *     description: >
 *       Reverses every `CONSUMPTION` movement recorded for `orderRef` with a
 *       matching `RETURN` movement on the same ingredient. Idempotent: a repeat
 *       returns the original `RETURN`s with status 200. 404 if no consumption
 *       was ever recorded for the order.
 *     security: [{ apiTokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ExternalReleaseInput' }
 *     responses:
 *       201: { description: Stock restored }
 *       200: { description: "Replay — original RETURN movements returned, no change" }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
externalRouter.post('/stock/release', validateBody(releaseSchema), controller.release);
