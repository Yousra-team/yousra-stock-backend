import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendData } from '../../shared/response';
import * as service from './invoice.service';

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { items, meta } = await service.listInvoices(req.user!.companyId, pagination);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const invoice = await service.getInvoiceById(req.user!.companyId, id);
  sendData(res, invoice);
}
