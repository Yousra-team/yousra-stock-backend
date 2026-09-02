import crypto from 'node:crypto';
import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateExternalSystemInput } from './integration.schema';

type ExternalSystemRow = FieldOutputTypes['public']['ExternalSystem'];
export type PublicExternalSystem = Omit<ExternalSystemRow, 'apiToken'>;

function toPublic(system: ExternalSystemRow): PublicExternalSystem {
  const { apiToken, ...publicSystem } = system;
  void apiToken;
  return publicSystem;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** The plaintext `apiToken` exists only in this one response — see the contract comment on `ExternalSystem`. */
export interface IssuedCredentials {
  system: PublicExternalSystem;
  apiToken: string;
}

export async function createExternalSystem(
  companyId: string,
  input: CreateExternalSystemInput,
): Promise<IssuedCredentials> {
  const apiToken = generateToken();

  const system = await db.orm.public.ExternalSystem.create({
    name: input.name,
    description: input.description,
    phone: input.phone,
    apiToken,
    companyId,
  });

  return { system: toPublic(system), apiToken };
}

export async function listExternalSystems(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.ExternalSystem
      .where((es) => es.companyId.eq(companyId))
      .where((es) => es.deletedAt.isNull())
      .include('company', (c) => c.select('id', 'name'))
      .orderBy((es) => es.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.ExternalSystem
      .where((es) => es.companyId.eq(companyId))
      .where((es) => es.deletedAt.isNull())
      .aggregate((a) => ({ total: a.count() })),
  ]);

  return { items: items.map(toPublic), meta: buildMeta(pagination, total) };
}

async function getExternalSystemRow(companyId: string, id: string): Promise<ExternalSystemRow> {
  const system = await db.orm.public.ExternalSystem
    .where((es) => es.id.eq(id))
    .where((es) => es.companyId.eq(companyId))
    .where((es) => es.deletedAt.isNull())
    .first();

  if (!system) {
    throw new NotFoundError('External system not found');
  }
  return system;
}

export async function rotateKeys(companyId: string, id: string): Promise<IssuedCredentials> {
  await getExternalSystemRow(companyId, id);

  const apiToken = generateToken();

  const updated = await db.orm.public.ExternalSystem
    .where((es) => es.id.eq(id))
    .where((es) => es.companyId.eq(companyId))
    .update({ apiToken });

  return { system: toPublic(updated!), apiToken };
}

export async function revokeExternalSystem(companyId: string, id: string): Promise<void> {
  await getExternalSystemRow(companyId, id);

  await db.orm.public.ExternalSystem
    .where((es) => es.id.eq(id))
    .where((es) => es.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}

/**
 * Look up a live external system by the plaintext `apiToken` it presented.
 * Used by the `requireExternalSystem` middleware — the service-to-service
 * auth path, entirely separate from the human JWT in `requireAuth`.
 */
export async function findExternalSystemByToken(token: string): Promise<ExternalSystemRow | null> {
  return db.orm.public.ExternalSystem
    .where((es) => es.apiToken.eq(token))
    .where((es) => es.deletedAt.isNull())
    .first();
}
