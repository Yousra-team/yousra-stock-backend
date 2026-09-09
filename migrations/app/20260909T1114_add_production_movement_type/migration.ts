#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2bf42c09f96ce1632c493dd4b64e79fe09c13506b4daf2ba41fafb279bdec86d/contract';
import endContract from '../../snapshots/2bf42c09f96ce1632c493dd4b64e79fe09c13506b4daf2ba41fafb279bdec86d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5add5679f17ba2413d019e70b8efeb76e4d88f1b39601c62966a34a796c49aae/contract';
import startContract from '../../snapshots/5add5679f17ba2413d019e70b8efeb76e4d88f1b39601c62966a34a796c49aae/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'stockMovement_type_check_9d26df34',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'stockMovement',
        constraint: 'stockMovement_type_check_bbeb80a5',
        expression:
          "\"type\" IN ('STOCK_IN', 'CONSUMPTION', 'MANUAL_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'PRODUCTION', 'SALE', 'RETURN')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
