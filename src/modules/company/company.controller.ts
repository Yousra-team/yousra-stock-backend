import type { Request, Response } from 'express';
import { ForbiddenError } from '../../shared/errors';
import { sendCreated, sendData } from '../../shared/response';
import { signAuthToken } from '../../shared/jwt';
import * as service from './company.service';
import type { CreateCompanyInput, UpdateCompanyInput } from './company.schema';

/** `POST /companies` — public. Auto-logs the new owner in (returns a token alongside the created rows). */
export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateCompanyInput;
  const { company, user } = await service.createCompanyWithOwner(body);
  const token = signAuthToken({ id: user.employeeId, companyId: company.id, role: user.role });

  sendCreated(res, { company, user, token });
}

/** A tenant may only ever see/modify its own company row — there is no cross-tenant listing. */
function assertOwnCompany(req: Request, companyId: string): void {
  if (companyId !== req.user!.companyId) {
    throw new ForbiddenError('Cannot access another company');
  }
}

/** `GET /companies` — returns the caller's own company as a single-item list (no cross-tenant listing exists). */
export async function list(req: Request, res: Response): Promise<void> {
  const company = await service.getCompanyById(req.user!.companyId);
  sendData(res, [company], { page: 1, pageSize: 1, total: 1 });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  assertOwnCompany(req, id);
  const company = await service.getCompanyById(id);
  sendData(res, company);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  assertOwnCompany(req, id);
  const body = req.body as UpdateCompanyInput;
  const company = await service.updateCompany(id, body);
  sendData(res, company);
}
