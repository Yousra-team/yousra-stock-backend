import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './unit.controller';
import { convertQuerySchema, createUnitSchema, updateUnitSchema } from './unit.schema';

export const unitRouter = Router();

unitRouter.use(requireAuth);

/**
 * @openapi
 * /measurements/units:
 *   post:
 *     tags: [Measurements]
 *     summary: Create a unit
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateUnitInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Unit' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     tags: [Measurements]
 *     summary: List units
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Unit' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
unitRouter.post('/', validateBody(createUnitSchema), controller.create);
unitRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /measurements/units/convert:
 *   get:
 *     tags: [Measurements]
 *     summary: Convert a quantity between two units of the same family
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: fromUnitId, required: true, schema: { type: string } }
 *       - { in: query, name: toUnitId, required: true, schema: { type: string } }
 *       - { in: query, name: quantity, required: true, schema: { type: number } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: object, properties: { fromUnitId: { type: string, format: uuid }, toUnitId: { type: string, format: uuid }, quantity: { type: number }, result: { type: number }, family: { type: string, enum: [MASS, VOLUME, UNIT] } } } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Mounted before /:id — otherwise Express would match "convert" as an :id param.
unitRouter.get('/convert', validateQuery(convertQuerySchema), controller.convert);

/**
 * @openapi
 * /measurements/units/{id}:
 *   get:
 *     tags: [Measurements]
 *     summary: Get a unit by id
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Unit' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Measurements]
 *     summary: Update a unit
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateUnitInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Unit' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Measurements]
 *     summary: Soft-delete a unit
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
unitRouter.get('/:id', controller.getById);
unitRouter.patch('/:id', validateBody(updateUnitSchema), controller.update);
unitRouter.delete('/:id', controller.remove);
