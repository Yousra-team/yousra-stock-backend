import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './item.service';
import type { CreateItemInput, UpdateItemInput } from './item.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const item = await service.createItem(req.user!.companyId, req.body as CreateItemInput);
  sendCreated(res, item);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listItems(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const item = await service.getItemById(req.user!.companyId, id);
  sendData(res, item);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const item = await service.updateItem(req.user!.companyId, id, req.body as UpdateItemInput);
  sendData(res, item);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteItem(req.user!.companyId, id);
  res.status(204).send();
}
