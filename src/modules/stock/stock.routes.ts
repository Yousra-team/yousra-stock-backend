import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './stock.controller';
import { createStockMovementSchema } from './stock.schema';

export const stockLevelRouter = Router();
stockLevelRouter.use(requireAuth);

/**
 * @openapi
 * /stock-levels:
 *   get:
 *     tags: [Stock]
 *     summary: List current stock levels
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/StockLevel' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
stockLevelRouter.get('/', validateQuery(paginationQuerySchema), controller.listLevels);

/**
 * @openapi
 * /stock-levels/{warehouseId}/{itemId}:
 *   get:
 *     tags: [Stock]
 *     summary: Get the current stock level for one item in one warehouse
 *     description: A pair with no movements yet returns quantity "0", not a 404.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: warehouseId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: itemId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/StockLevel' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
stockLevelRouter.get('/:warehouseId/:itemId', controller.getLevel);

export const stockMovementRouter = Router();
stockMovementRouter.use(requireAuth);

/**
 * @openapi
 * /stock-movements:
 *   post:
 *     tags: [Stock]
 *     summary: Record a manual stock movement (CONSUMPTION, MANUAL_OUT, or ADJUSTMENT)
 *     description: >
 *       Body shape depends on `type`. ADJUSTMENT takes `direction` (increase|decrease)
 *       — use it to set a new item's opening quantity or correct a count. MANUAL_OUT
 *       takes `reason`. CONSUMPTION takes `nomenclatureId`. STOCK_IN / TRANSFER_* are
 *       not reachable here.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateStockMovementInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/StockMovement' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [Stock]
 *     summary: List stock movements
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/StockMovement' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
stockMovementRouter.post('/', validateBody(createStockMovementSchema), controller.createMovement);
stockMovementRouter.get('/', validateQuery(paginationQuerySchema), controller.listMovements);

/**
 * @openapi
 * /stock-movements/{id}:
 *   get:
 *     tags: [Stock]
 *     summary: Get a stock movement by id
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/StockMovement' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
stockMovementRouter.get('/:id', controller.getMovementById);
