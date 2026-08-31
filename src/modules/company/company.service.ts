import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { omitUndefined } from '../../shared/omitUndefined';
import { createUser, toPublicUser } from '../auth';
import type { CreateCompanyInput, UpdateCompanyInput } from './company.schema';

type CompanyRow = FieldOutputTypes['public']['Company'];

/** Creates the Company and its first (Admin) user in one transaction — see the auth-bootstrap note in `CLAUDE_CODE_BRIEF`. */
export async function createCompanyWithOwner(input: CreateCompanyInput) {
  return db.transaction(async (tx) => {
    const company = await tx.orm.public.Company.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      city: input.city,
      country: input.country,
    });

    const owner = await createUser(tx, {
      ...input.owner,
      role: 'Admin',
      companyId: company.id,
    });

    return { company, user: toPublicUser(owner) };
  });
}

export async function getCompanyById(companyId: string): Promise<CompanyRow> {
  const company = await db.orm.public.Company.where((c) => c.id.eq(companyId)).first();
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  return company;
}

export async function updateCompany(companyId: string, data: UpdateCompanyInput): Promise<CompanyRow> {
  // Confirms the row exists before updating so a bad id gives a clean 404 instead of a silent no-op.
  await getCompanyById(companyId);

  const updated = await db.orm.public.Company.where((c) => c.id.eq(companyId)).update(omitUndefined(data));
  return updated!;
}
