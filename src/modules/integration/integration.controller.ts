import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './integration.service';
import type { CreateExternalSystemInput } from './integration.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const result = await service.createExternalSystem(req.user!.companyId, req.body as CreateExternalSystemInput);
  sendCreated(res, result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listExternalSystems(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function rotateKeys(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const result = await service.rotateKeys(req.user!.companyId, id);
  sendData(res, result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.revokeExternalSystem(req.user!.companyId, id);
  res.status(204).send();
}
