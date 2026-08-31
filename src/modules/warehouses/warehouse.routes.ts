import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './warehouse.controller';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouse.schema';

export const warehouseRouter = Router();

warehouseRouter.use(requireAuth);

/**
 * @openapi
 * /warehouses:
 *   post:
 *     tags: [Warehouses]
 *     summary: Create a warehouse
 *     description: "`companyId` is taken from the authenticated user — not accepted in the body."
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateWarehouseInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Warehouse' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     tags: [Warehouses]
 *     summary: List warehouses
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Warehouse' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
warehouseRouter.post('/', validateBody(createWarehouseSchema), controller.create);
warehouseRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /warehouses/{id}:
 *   get:
 *     tags: [Warehouses]
 *     summary: Get a warehouse by id
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Warehouse' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Warehouses]
 *     summary: Update a warehouse
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateWarehouseInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Warehouse' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Warehouses]
 *     summary: Soft-delete a warehouse
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
warehouseRouter.get('/:id', controller.getById);
warehouseRouter.patch('/:id', validateBody(updateWarehouseSchema), controller.update);
warehouseRouter.delete('/:id', controller.remove);
