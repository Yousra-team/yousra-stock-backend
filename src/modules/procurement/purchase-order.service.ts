import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { allocateDocumentReference } from '../../shared/documentNumber';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getSupplierById } from '../suppliers';
import { getWarehouseById } from '../warehouses';
import { getItemById } from '../catalog';
import type { CreatePurchaseOrderInput } from './purchase-order.schema';

type PurchaseOrderRow = FieldOutputTypes['public']['PurchaseOrder'];
type PurchaseOrderItemRow = FieldOutputTypes['public']['PurchaseOrderItem'];
export type PurchaseOrderWithItems = PurchaseOrderRow & { items: PurchaseOrderItemRow[] };

const TERMINAL_STATUSES = new Set(['RECEIVED', 'CANCELLED']);

export async function createPurchaseOrder(
  companyId: string,
  createdBy: string,
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderWithItems> {
  await getSupplierById(companyId, input.supplierId);
  await getWarehouseById(companyId, input.warehouseId);
  for (const item of input.items) {
    await getItemById(companyId, item.itemId);
  }

  return db.transaction(async (tx) => {
    const purchaseOrder = await tx.orm.public.PurchaseOrder.create({
      reference: await allocateDocumentReference(tx, 'PO'),
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      expectedAt: input.expectedAt,
      status: input.status ?? 'DRAFT',
      createdBy,
    });

    const items: PurchaseOrderItemRow[] = [];
    for (const item of input.items) {
      items.push(
        await tx.orm.public.PurchaseOrderItem.create({
          purchaseOrderId: purchaseOrder.id,
          itemId: item.itemId,
          unitCost: item.unitCost,
          quantity: item.quantity,
        }),
      );
    }

    return { ...purchaseOrder, items };
  });
}

/** `PurchaseOrder` has no `companyId` of its own — tenancy is scoped through `supplierId`, same pattern as nomenclature-through-item. */
export async function listPurchaseOrders(companyId: string, pagination: PaginationParams) {
  const companySuppliers = await db.orm.public.Supplier.where((s) => s.companyId.eq(companyId)).select('id').all();
  const supplierIds = companySuppliers.map((s) => s.id);

  if (supplierIds.length === 0) {
    return { items: [], meta: buildMeta(pagination, 0) };
  }

  const [orders, { total }] = await Promise.all([
    db.orm.public.PurchaseOrder
      .where((po) => po.supplierId.in(supplierIds))
      .include('supplier', (s) => s.select('id', 'name'))
      .include('warehouse', (w) => w.select('id', 'name'))
      .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
      .include('items', (branch) =>
        branch
          .select('id', 'purchaseOrderId', 'itemId', 'unitCost', 'quantity', 'createdAt', 'updatedAt')
          .include('item', (it) => it.select('id', 'name')),
      )
      .orderBy((po) => po.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.PurchaseOrder.where((po) => po.supplierId.in(supplierIds)).aggregate((a) => ({
      total: a.count(),
    })),
  ]);

  return { items: orders, meta: buildMeta(pagination, total) };
}

export async function getPurchaseOrderById(companyId: string, id: string): Promise<PurchaseOrderWithItems> {
  const purchaseOrder = await db.orm.public.PurchaseOrder
    .include('supplier', (s) => s.select('id', 'name'))
    .include('warehouse', (w) => w.select('id', 'name'))
    .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
    .include('items', (branch) =>
      branch
        .select('id', 'purchaseOrderId', 'itemId', 'unitCost', 'quantity', 'createdAt', 'updatedAt')
        .include('item', (it) => it.select('id', 'name')),
    )
    .where((po) => po.id.eq(id))
    .first();

  if (!purchaseOrder) {
    throw new NotFoundError('Purchase order not found');
  }
  // Company-scoping goes through the supplier (PurchaseOrder has no companyId of its own).
  await getSupplierById(companyId, purchaseOrder.supplierId);

  return purchaseOrder;
}

export async function updatePurchaseOrderStatus(
  companyId: string,
  id: string,
  status: PurchaseOrderRow['status'],
): Promise<PurchaseOrderRow> {
  const purchaseOrder = await getPurchaseOrderById(companyId, id);
  if (TERMINAL_STATUSES.has(purchaseOrder.status)) {
    throw new ConflictError(`Cannot change status of a ${purchaseOrder.status} purchase order`);
  }

  const updated = await db.orm.public.PurchaseOrder.where((po) => po.id.eq(id)).update({ status });
  return updated!;
}

export async function cancelPurchaseOrder(companyId: string, id: string): Promise<void> {
  const purchaseOrder = await getPurchaseOrderById(companyId, id);
  if (TERMINAL_STATUSES.has(purchaseOrder.status)) {
    throw new ConflictError(`Cannot cancel a ${purchaseOrder.status} purchase order`);
  }

  await db.orm.public.PurchaseOrder.where((po) => po.id.eq(id)).update({ status: 'CANCELLED' });
}
