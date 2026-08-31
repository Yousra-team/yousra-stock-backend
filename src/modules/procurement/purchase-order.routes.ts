import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './purchase-order.controller';
import { createPurchaseOrderSchema, updatePurchaseOrderStatusSchema } from './purchase-order.schema';

export const purchaseOrderRouter = Router();

purchaseOrderRouter.use(requireAuth);

/**
 * @openapi
 * /purchases:
 *   post:
 *     tags: [Procurement]
 *     summary: Create a purchase order
 *     description: "`createdBy` is derived from the authenticated user."
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreatePurchaseOrderInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/PurchaseOrder' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   get:
 *     tags: [Procurement]
 *     summary: List purchase orders
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/PurchaseOrder' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
purchaseOrderRouter.post('/', validateBody(createPurchaseOrderSchema), controller.create);
purchaseOrderRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /purchases/{id}:
 *   get:
 *     tags: [Procurement]
 *     summary: Get a purchase order (with items)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/PurchaseOrder' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Procurement]
 *     summary: Update purchase order status
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdatePurchaseOrderStatusInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/PurchaseOrder' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Procurement]
 *     summary: Cancel a purchase order
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
purchaseOrderRouter.get('/:id', controller.getById);
purchaseOrderRouter.patch('/:id', validateBody(updatePurchaseOrderStatusSchema), controller.updateStatus);
purchaseOrderRouter.delete('/:id', controller.cancel);
