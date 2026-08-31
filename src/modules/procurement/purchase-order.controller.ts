import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './purchase-order.service';
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderStatusInput } from './purchase-order.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const purchaseOrder = await service.createPurchaseOrder(
    req.user!.companyId,
    req.user!.id,
    req.body as CreatePurchaseOrderInput,
  );
  sendCreated(res, purchaseOrder);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listPurchaseOrders(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const purchaseOrder = await service.getPurchaseOrderById(req.user!.companyId, id);
  sendData(res, purchaseOrder);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { status } = req.body as UpdatePurchaseOrderStatusInput;
  const purchaseOrder = await service.updatePurchaseOrderStatus(req.user!.companyId, id, status);
  sendData(res, purchaseOrder);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.cancelPurchaseOrder(req.user!.companyId, id);
  res.status(204).send();
}
