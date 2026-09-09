import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody } from '../../shared/validate';
import * as controller from './production.controller';
import { createProductionSchema } from './production.schema';

export const productionRouter = Router();

productionRouter.use(requireAuth);

/**
 * @openapi
 * /production:
 *   post:
 *     tags: [Production]
 *     summary: Record a production run — build a batch of a made item from its recipe
 *     description: >
 *       `quantity` units of `itemId` are built at `warehouseId` from the item's
 *       **active** nomenclature. The recipe is exploded to its stock-tracked
 *       inputs (raw materials and already-produced semi-finished goods; a
 *       sub-recipe is followed only for a non-stocked phantom), each input is
 *       drawn down with a `CONSUMPTION` movement, and the produced units are
 *       added with one `PRODUCTION` movement — all in one transaction.
 *       This is the only place a semi-finished good's own components (e.g. the
 *       flour behind "pâte à farine") are consumed.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateProductionInput' }
 *     responses:
 *       201:
 *         description: Batch produced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     produced: { $ref: '#/components/schemas/StockMovement' }
 *                     consumed:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/StockMovement' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: >
 *           The item has no active recipe, insufficient input stock, or the
 *           recipe is misconfigured (cycle / too deep / non-stock phantom).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
productionRouter.post('/', validateBody(createProductionSchema), controller.create);
