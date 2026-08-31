import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './supplier.service';
import type { CreateSupplierInput, UpdateSupplierInput } from './supplier.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const supplier = await service.createSupplier(req.user!.companyId, req.body as CreateSupplierInput);
  sendCreated(res, supplier);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listSuppliers(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const supplier = await service.getSupplierById(req.user!.companyId, id);
  sendData(res, supplier);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const supplier = await service.updateSupplier(req.user!.companyId, id, req.body as UpdateSupplierInput);
  sendData(res, supplier);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteSupplier(req.user!.companyId, id);
  res.status(204).send();
}
