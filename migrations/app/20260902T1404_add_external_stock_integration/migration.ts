#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4ad279f028c7b857f28d9b12608999e461b1393d3beceec931bb81e166472761/contract';
import startContract from '../../snapshots/4ad279f028c7b857f28d9b12608999e461b1393d3beceec931bb81e166472761/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5add5679f17ba2413d019e70b8efeb76e4d88f1b39601c62966a34a796c49aae/contract';
import endContract from '../../snapshots/5add5679f17ba2413d019e70b8efeb76e4d88f1b39601c62966a34a796c49aae/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'externalSystem', column: 'apiSecretHash' }),
      this.dropConstraint({
        schema: 'public',
        table: 'externalSystem',
        constraint: 'externalSystem_apiKeyHash_key',
      }),
      this.dropColumn({ schema: 'public', table: 'externalSystem', column: 'apiKeyHash' }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'stockMovement_type_check_a6d21566',
      }),
      this.addColumn({
        schema: 'public',
        table: 'externalSystem',
        column: col('apiToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'stockMovement',
        column: col('createdByExternalSystemId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'stockMovement',
        column: col('externalRef', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'warehouse',
        column: col('code', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dropNotNull({ schema: 'public', table: 'stockMovement', column: 'createdBy' }),
      this.addUnique({
        schema: 'public',
        table: 'externalSystem',
        constraint: 'externalSystem_apiToken_key',
        columns: ['apiToken'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'movement_exactly_one_actor_054dbc0c',
        expression:
          '((("createdBy" IS NOT NULL)::int + ("createdByExternalSystemId" IS NOT NULL)::int) = 1)',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'stockMovement_type_check_9d26df34',
        expression:
          "\"type\" IN ('STOCK_IN', 'CONSUMPTION', 'MANUAL_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'SALE', 'RETURN')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'warehouse',
        constraint: 'warehouse_companyId_code_key',
        columns: ['companyId', 'code'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stockMovement',
        index: 'stockMovement_createdByExternalSystemId_idx_06e09185',
        columns: ['createdByExternalSystemId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stockMovement',
        index: 'stockmovement_external_ref_9bd0c997',
        columns: ['createdByExternalSystemId', 'externalRef'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stockMovement',
        foreignKey: {
          name: 'stockMovement_createdByExternalSystemId_fkey',
          columns: ['createdByExternalSystemId'],
          references: { schema: 'public', table: 'externalSystem', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
