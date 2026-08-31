import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './unit.service';
import type { ConvertQuery, CreateUnitInput, UpdateUnitInput } from './unit.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const unit = await service.createUnit(req.body as CreateUnitInput);
  sendCreated(res, unit);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listUnits(pagination);
  sendData(res, items, meta);
}

export async function convert(req: Request, res: Response): Promise<void> {
  const { fromUnitId, toUnitId, quantity } = req.validatedQuery as ConvertQuery;
  const result = await service.convertUnits(fromUnitId, toUnitId, quantity);
  sendData(res, result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const unit = await service.getUnitById(id);
  sendData(res, unit);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const unit = await service.updateUnit(id, req.body as UpdateUnitInput);
  sendData(res, unit);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteUnit(id);
  res.status(204).send();
}
