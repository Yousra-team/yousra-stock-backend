#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0155049009fa95e56a30af8a4c28aad54fba4d07a096518234dde070edb67e12/contract';
import startContract from '../../snapshots/0155049009fa95e56a30af8a4c28aad54fba4d07a096518234dde070edb67e12/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4ad279f028c7b857f28d9b12608999e461b1393d3beceec931bb81e166472761/contract';
import endContract from '../../snapshots/4ad279f028c7b857f28d9b12608999e461b1393d3beceec931bb81e166472761/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'documentCounter',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('day', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('scope', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('value', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['scope', 'day'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'goodsReceipt',
        column: col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'purchaseOrder',
        column: col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'stockMovement',
        column: col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'goodsReceipt',
        constraint: 'goodsReceipt_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'purchaseOrder',
        constraint: 'purchaseOrder_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'stockMovement_reference_key',
        columns: ['reference'],
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'documentCounter' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
