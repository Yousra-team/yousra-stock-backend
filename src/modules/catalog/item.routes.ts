import { Router } from 'express';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './item.controller';
import { createItemSchema, updateItemSchema } from './item.schema';

export const itemRouter = Router();

/**
 * @openapi
 * /catalog/items:
 *   post:
 *     tags: [Catalog]
 *     summary: Create an item
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateItemInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Item' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   get:
 *     tags: [Catalog]
 *     summary: List items
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Item' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
itemRouter.post('/', validateBody(createItemSchema), controller.create);
itemRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /catalog/items/{id}:
 *   get:
 *     tags: [Catalog]
 *     summary: Get an item by id
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Item' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Catalog]
 *     summary: Update an item
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateItemInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Item' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Catalog]
 *     summary: Soft-delete an item
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
itemRouter.get('/:id', controller.getById);
itemRouter.patch('/:id', validateBody(updateItemSchema), controller.update);
itemRouter.delete('/:id', controller.remove);
