import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { categoryRouter } from './category.routes';
import { itemRouter } from './item.routes';

export const catalogRouter = Router();

catalogRouter.use(requireAuth);
catalogRouter.use('/categories', categoryRouter);
catalogRouter.use('/items', itemRouter);
