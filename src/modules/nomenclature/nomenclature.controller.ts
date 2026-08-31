import type { Request, Response } from 'express';
import { parsePagination, type PaginationQuery } from '../../shared/pagination';
import { sendCreated, sendData } from '../../shared/response';
import * as service from './nomenclature.service';
import type { CreateNomenclatureInput, UpdateNomenclatureInput } from './nomenclature.schema';

export async function create(req: Request, res: Response): Promise<void> {
  const nomenclature = await service.createNomenclature(req.user!.companyId, req.body as CreateNomenclatureInput);
  sendCreated(res, nomenclature);
}

export async function list(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.validatedQuery as PaginationQuery);
  const { itemId } = req.validatedQuery as { itemId?: string };
  const { items, meta } = await service.listNomenclature(req.user!.companyId, pagination, itemId);
  sendData(res, items, meta);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const nomenclature = await service.getNomenclatureById(req.user!.companyId, id);
  sendData(res, nomenclature);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const nomenclature = await service.updateNomenclatureNotes(
    req.user!.companyId,
    id,
    req.body as UpdateNomenclatureInput,
  );
  sendData(res, nomenclature);
}

export async function activate(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const nomenclature = await service.activateNomenclature(req.user!.companyId, id);
  sendData(res, nomenclature);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await service.softDeleteNomenclature(req.user!.companyId, id);
  res.status(204).send();
}
