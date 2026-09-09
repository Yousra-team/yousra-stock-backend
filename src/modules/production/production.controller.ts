import type { Request, Response } from 'express';
import { sendCreated } from '../../shared/response';
import * as service from './production.service';
import type { CreateProductionInput } from './production.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const result = await service.recordProduction(
    req.user!.companyId,
    req.user!.id,
    req.body as CreateProductionInput,
  );
  sendCreated(res, result);
}
