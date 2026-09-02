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
 *     summary: Current stock for a set of items at one location (batch)
 *     description: >
 *       `companyId` is derived from the API token. `itemIds` are Yousra Item
 *       UUIDs; an item with no movements yet reports quantity `"0"`.
 *     security: [{ apiTokenAuth: [] }]
 *     parameters:
 *       - { in: query, name: system, required: true, schema: { type: string }, description: Caller's registered name; must match the token. }
 *       - { in: query, name: locationCode, required: true, schema: { type: string }, description: Warehouse code (e.g. akwa-branch). }
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
 *     summary: An external order was confirmed — decrement stock (one SALE movement per line)
 *     description: >
 *       Idempotent on `orderRef`: a repeat returns the original movements with
 *       status 200 and moves no stock. Insufficient stock for any line rolls the
 *       whole call back with a 409. Movements are attributed to the calling
 *       external system, not a user.
 *     security: [{ apiTokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ExternalConsumeInput' }
 *     responses:
 *       201: { description: Stock decremented }
 *       200: { description: Replay — original movements returned, no change }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
externalRouter.post('/stock/consume', validateBody(consumeSchema), controller.consume);

/**
 * @openapi
 * /external/stock/release:
 *   post:
 *     tags: [External]
 *     summary: A previously-consumed external order was cancelled — restore its stock
 *     description: >
 *       Reverses every SALE movement recorded for `orderRef` with a matching
 *       RETURN movement. Idempotent: a repeat returns the original RETURNs with
 *       status 200. 404 if no consumption was ever recorded for the order.
 *     security: [{ apiTokenAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ExternalReleaseInput' }
 *     responses:
 *       201: { description: Stock restored }
 *       200: { description: Replay — original RETURN movements returned, no change }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
externalRouter.post('/stock/release', validateBody(releaseSchema), controller.release);
