import { Router } from 'express';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './category.controller';
import { createCategorySchema, updateCategorySchema } from './category.schema';

export const categoryRouter = Router();

/**
 * @openapi
 * /catalog/categories:
 *   post:
 *     tags: [Catalog]
 *     summary: Create a category
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateCategoryInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/ItemCategory' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     tags: [Catalog]
 *     summary: List categories
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/ItemCategory' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
categoryRouter.post('/', validateBody(createCategorySchema), controller.create);
categoryRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /catalog/categories/{id}:
 *   get:
 *     tags: [Catalog]
 *     summary: Get a category by id
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/ItemCategory' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Catalog]
 *     summary: Update a category
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateCategoryInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/ItemCategory' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Catalog]
 *     summary: Soft-delete a category
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
categoryRouter.get('/:id', controller.getById);
categoryRouter.patch('/:id', validateBody(updateCategorySchema), controller.update);
categoryRouter.delete('/:id', controller.remove);
