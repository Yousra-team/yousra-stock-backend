import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import { z } from 'zod';
import * as controller from './nomenclature.controller';
import { createNomenclatureSchema, updateNomenclatureSchema } from './nomenclature.schema';

export const nomenclatureRouter = Router();

nomenclatureRouter.use(requireAuth);

const listQuerySchema = paginationQuerySchema.extend({ itemId: z.uuid().optional() });

/**
 * @openapi
 * /nomenclature:
 *   post:
 *     tags: [Nomenclature]
 *     summary: Create a new (draft) BOM version for an item
 *     description: Changing a recipe means a new version — there is no lines-edit endpoint. Activate it via POST /nomenclature/{id}/activate.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateNomenclatureInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Nomenclature' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   get:
 *     tags: [Nomenclature]
 *     summary: List BOM versions, optionally filtered by itemId
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { $ref: '#/components/parameters/PageParam' }
 *       - { $ref: '#/components/parameters/PageSizeParam' }
 *       - { in: query, name: itemId, required: false, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Nomenclature' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
nomenclatureRouter.post('/', validateBody(createNomenclatureSchema), controller.create);
nomenclatureRouter.get('/', validateQuery(listQuerySchema), controller.list);

/**
 * @openapi
 * /nomenclature/{id}:
 *   get:
 *     tags: [Nomenclature]
 *     summary: Get a BOM version (with lines)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Nomenclature' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Nomenclature]
 *     summary: Update notes on a BOM version (notes only — lines are immutable)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateNomenclatureInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Nomenclature' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Nomenclature]
 *     summary: Soft-delete a (non-active) BOM version
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
nomenclatureRouter.get('/:id', controller.getById);
nomenclatureRouter.patch('/:id', validateBody(updateNomenclatureSchema), controller.update);
nomenclatureRouter.delete('/:id', controller.remove);

/**
 * @openapi
 * /nomenclature/{id}/activate:
 *   post:
 *     tags: [Nomenclature]
 *     summary: Promote this version to active, demoting the previous active version
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Nomenclature' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
nomenclatureRouter.post('/:id/activate', controller.activate);
