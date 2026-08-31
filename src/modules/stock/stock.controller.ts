import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './stock.service';
import type { CreateStockMovementInput } from './stock.schema';

export async function listLevels(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listStockLevels(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getLevel(req: Request, res: Response): Promise<void> {
  const { warehouseId, itemId } = req.params as { warehouseId: string; itemId: string };
  const level = await service.getStockLevel(req.user!.companyId, warehouseId, itemId);
  sendData(res, level);
}

export async function createMovement(req: Request, res: Response): Promise<void> {
  const movement = await service.createStockMovement(
    req.user!.companyId,
    req.user!.id,
    req.body as CreateStockMovementInput,
  );
  sendCreated(res, movement);
}

export async function listMovements(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listStockMovements(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getMovementById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const movement = await service.getStockMovementById(req.user!.companyId, id);
  sendData(res, movement);
}
