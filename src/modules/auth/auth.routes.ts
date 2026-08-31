import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { validateBody } from '../../shared/validate';
import * as controller from './auth.controller';
import { loginSchema, registerUserSchema } from './auth.schema';

export const authRouter = Router();

/**
 * @openapi
 * /auth/user:
 *   post:
 *     tags: [Auth]
 *     summary: Add a teammate to the caller's own company (Admin-only)
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/RegisterUserInput' } } } }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/User' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
authRouter.post('/user', requireAuth, validateBody(registerUserSchema), controller.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email + password, receive a JWT
 *     requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/LoginInput' } } } }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/AuthResult' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
authRouter.post('/login', validateBody(loginSchema), controller.login);
