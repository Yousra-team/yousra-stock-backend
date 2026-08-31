import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody } from '../../shared/validate';
import * as controller from './company.controller';
import { createCompanySchema, updateCompanySchema } from './company.schema';

export const companyRouter = Router();

/**
 * @openapi
 * /companies:
 *   post:
 *     tags: [Company]
 *     summary: Create a company and its first (Admin) user
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/CreateCompanyInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Company' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
companyRouter.post('/', validateBody(createCompanySchema), controller.create);

// Everything below requires an authenticated user of the company being read/modified.
companyRouter.use(requireAuth);

/**
 * @openapi
 * /companies:
 *   get:
 *     tags: [Company]
 *     summary: Get the caller's own company (returned as a single-item list — there is no cross-tenant listing)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Company' } } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
companyRouter.get('/', controller.list);

/**
 * @openapi
 * /companies/{id}:
 *   get:
 *     tags: [Company]
 *     summary: Get a company by id (must be the caller's own company)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Company' } } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: Forbidden — not the caller's own company, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *   patch:
 *     tags: [Company]
 *     summary: Update the caller's own company
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/UpdateCompanyInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/Company' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: Forbidden — not the caller's own company, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
companyRouter.get('/:id', controller.getById);
companyRouter.patch('/:id', validateBody(updateCompanySchema), controller.update);
