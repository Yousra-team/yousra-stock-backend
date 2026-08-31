import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { authRouter } from './modules/auth';
import { companyRouter } from './modules/company';
import { supplierRouter } from './modules/suppliers';
import { warehouseRouter } from './modules/warehouses';
import { unitRouter } from './modules/measurements';
import { catalogRouter } from './modules/catalog';
import { nomenclatureRouter } from './modules/nomenclature';
import { purchaseOrderRouter, procurementRouter } from './modules/procurement';
import { stockLevelRouter, stockMovementRouter } from './modules/stock';
import { integrationRouter } from './modules/integration';

import { errorHandler, notFoundHandler } from './shared/errorHandler';
import { openapiSpec } from './swagger';

for (const name of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/companies', companyRouter);
app.use('/api/v1/suppliers', supplierRouter);
app.use('/api/v1/warehouses', warehouseRouter);
app.use('/api/v1/measurements/units', unitRouter);
app.use('/api/v1/catalog', catalogRouter);
app.use('/api/v1/nomenclature', nomenclatureRouter);
app.use('/api/v1/purchases', purchaseOrderRouter);
app.use('/api/v1/procurement', procurementRouter);
app.use('/api/v1/stock-levels', stockLevelRouter);
app.use('/api/v1/stock-movements', stockMovementRouter);
app.use('/api/v1/integration/systems', integrationRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
