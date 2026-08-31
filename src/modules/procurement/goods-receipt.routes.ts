import { Router } from 'express';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './goods-receipt.controller';
import { createGoodsReceiptSchema } from './goods-receipt.schema';

export const goodsReceiptRouter = Router();

/**
 * @openapi
 * /procurement/receipts:
 *   post:
 *     tags: [Procurement]
 *     summary: Record a goods receipt against a purchase order
 *     description: >
 *       Increments stock levels, appends STOCK_IN stock movements, generates
 *       an invoice, and rolls the parent purchase order's status forward.
 *       `supplierId` / `warehouseId` are derived from the purchase order.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateGoodsReceiptInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/GoodsReceipt' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   get:
 *     tags: [Procurement]
 *     summary: List goods receipts
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/GoodsReceipt' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
goodsReceiptRouter.post('/', validateBody(createGoodsReceiptSchema), controller.create);
goodsReceiptRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /procurement/receipts/{id}:
 *   get:
 *     tags: [Procurement]
 *     summary: Get a goods receipt (with items + invoice)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/GoodsReceipt' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
goodsReceiptRouter.get('/:id', controller.getById);
