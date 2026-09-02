import type { Request, Response } from 'express';
import { sendData } from '../../shared/response';
import * as service from './external.service';
import type { ConsumeInput, ExternalStockQuery, ReleaseInput } from './external.schema';

export async function getStock(req: Request, res: Response): Promise<void> {
  const result = await service.getExternalStock(
    req.externalSystem!,
    req.validatedQuery as ExternalStockQuery,
  );
  sendData(res, result);
}

export async function consume(req: Request, res: Response): Promise<void> {
  const result = await service.consumeStock(req.externalSystem!, req.body as ConsumeInput);
  sendData(res, result, undefined, result.replayed ? 200 : 201);
}

export async function release(req: Request, res: Response): Promise<void> {
  const result = await service.releaseStock(req.externalSystem!, req.body as ReleaseInput);
  sendData(res, result, undefined, result.replayed ? 200 : 201);
}
