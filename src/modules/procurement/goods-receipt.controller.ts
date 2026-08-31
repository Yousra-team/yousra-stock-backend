import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './goods-receipt.service';
import type { CreateGoodsReceiptInput } from './goods-receipt.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const receipt = await service.createGoodsReceipt(
    req.user!.companyId,
    req.user!.id,
    req.body as CreateGoodsReceiptInput,
  );
  sendCreated(res, receipt);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listGoodsReceipts(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const receipt = await service.getGoodsReceiptById(req.user!.companyId, id);
  sendData(res, receipt);
}
