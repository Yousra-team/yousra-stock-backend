import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody, validateQuery } from '../../shared/validate';
import { paginationQuerySchema } from '../../shared/pagination';
import * as controller from './integration.controller';
import { createExternalSystemSchema } from './integration.schema';

export const integrationRouter = Router();

integrationRouter.use(requireAuth);

/**
 * @openapi
 * /integration/systems:
 *   post:
 *     tags: [Integration]
 *     summary: Register an external system, issuing an API token (shown once)
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateExternalSystemInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/IssuedCredentials' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   get:
 *     tags: [Integration]
 *     summary: List external systems
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/PageSizeParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/ExternalSystem' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
integrationRouter.post('/', validateBody(createExternalSystemSchema), controller.create);
integrationRouter.get('/', validateQuery(paginationQuerySchema), controller.list);

/**
 * @openapi
 * /integration/systems/{id}/rotate-keys:
 *   post:
 *     tags: [Integration]
 *     summary: Rotate the API token for an external system (shown once)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/IssuedCredentials' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
integrationRouter.post('/:id/rotate-keys', controller.rotateKeys);

/**
 * @openapi
 * /integration/systems/{id}:
 *   delete:
 *     tags: [Integration]
 *     summary: Revoke an external system
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       204: { description: No Content }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
integrationRouter.delete('/:id', controller.remove);
