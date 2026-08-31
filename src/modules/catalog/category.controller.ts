import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './category.service';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const category = await service.createCategory(req.user!.companyId, req.body as CreateCategoryInput);
  sendCreated(res, category);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listCategories(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const category = await service.getCategoryById(req.user!.companyId, id);
  sendData(res, category);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const category = await service.updateCategory(req.user!.companyId, id, req.body as UpdateCategoryInput);
  sendData(res, category);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteCategory(req.user!.companyId, id);
  res.status(204).send();
}
