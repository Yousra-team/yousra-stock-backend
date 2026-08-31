import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './warehouse.service';
import type { CreateWarehouseInput, UpdateWarehouseInput } from './warehouse.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const warehouse = await service.createWarehouse(req.user!.companyId, req.body as CreateWarehouseInput);
  sendCreated(res, warehouse);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listWarehouses(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const warehouse = await service.getWarehouseById(req.user!.companyId, id);
  sendData(res, warehouse);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const warehouse = await service.updateWarehouse(req.user!.companyId, id, req.body as UpdateWarehouseInput);
  sendData(res, warehouse);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteWarehouse(req.user!.companyId, id);
  res.status(204).send();
}
