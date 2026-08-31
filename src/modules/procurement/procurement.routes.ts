import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/requireAuth';
import { goodsReceiptRouter } from './goods-receipt.routes';
import { invoiceRouter } from './invoice.routes';

/** Mounted at `/procurement`. `purchaseOrderRouter` is mounted separately at `/purchases` — see `src/index.ts`. */
export const procurementRouter = Router();

procurementRouter.use(requireAuth);
procurementRouter.use('/receipts', goodsReceiptRouter);
procurementRouter.use('/invoices', invoiceRouter);
