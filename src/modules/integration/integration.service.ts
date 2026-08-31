import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { NotFoundError } from '../../shared/errors';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import type { CreateExternalSystemInput } from './integration.schema';

type ExternalSystemRow = FieldOutputTypes['public']['ExternalSystem'];
export type PublicExternalSystem = Omit<ExternalSystemRow, 'apiKeyHash' | 'apiSecretHash'>;

const BCRYPT_ROUNDS = 10;

function toPublic(system: ExternalSystemRow): PublicExternalSystem {
  const { apiKeyHash, apiSecretHash, ...publicSystem } = system;
  void apiKeyHash;
  void apiSecretHash;
  return publicSystem;
}

function generateCredential(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Plaintext key/secret exist only for this one response — see the contract comment on `ExternalSystem`. */
export interface IssuedCredentials {
  system: PublicExternalSystem;
  apiKey: string;
  apiSecret: string;
}

export async function createExternalSystem(
  companyId: string,
  input: CreateExternalSystemInput,
): Promise<IssuedCredentials> {
  const apiKey = generateCredential();
  const apiSecret = generateCredential();
  const [apiKeyHash, apiSecretHash] = await Promise.all([
    bcrypt.hash(apiKey, BCRYPT_ROUNDS),
    bcrypt.hash(apiSecret, BCRYPT_ROUNDS),
  ]);

  const system = await db.orm.public.ExternalSystem.create({
    name: input.name,
    description: input.description,
    phone: input.phone,
    apiKeyHash,
    apiSecretHash,
    companyId,
  });

  return { system: toPublic(system), apiKey, apiSecret };
}

export async function listExternalSystems(companyId: string, pagination: PaginationParams) {
  const [items, { total }] = await Promise.all([
    db.orm.public.ExternalSystem
      .where((es) => es.companyId.eq(companyId))
      .where((es) => es.deletedAt.isNull())
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

  const apiKey = generateCredential();
  const apiSecret = generateCredential();
  const [apiKeyHash, apiSecretHash] = await Promise.all([
    bcrypt.hash(apiKey, BCRYPT_ROUNDS),
    bcrypt.hash(apiSecret, BCRYPT_ROUNDS),
  ]);

  const updated = await db.orm.public.ExternalSystem
    .where((es) => es.id.eq(id))
    .where((es) => es.companyId.eq(companyId))
    .update({ apiKeyHash, apiSecretHash });

  return { system: toPublic(updated!), apiKey, apiSecret };
}

export async function revokeExternalSystem(companyId: string, id: string): Promise<void> {
  await getExternalSystemRow(companyId, id);

  await db.orm.public.ExternalSystem
    .where((es) => es.id.eq(id))
    .where((es) => es.companyId.eq(companyId))
    .update({ deletedAt: new Date().toISOString() });
}
