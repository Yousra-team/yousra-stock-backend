import { db } from '../../prisma/db';
import type { FieldOutputTypes } from '../../prisma/contract.d';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { buildMeta, type PaginationParams } from '../../shared/pagination';
import { getItemById } from '../catalog';
import { recordStockMovement } from '../stock';
import { getPurchaseOrderById } from './purchase-order.service';
import type { CreateGoodsReceiptInput } from './goods-receipt.schema';

type GoodsReceiptRow = FieldOutputTypes['public']['GoodsReceipt'];
type GoodsReceiptItemRow = FieldOutputTypes['public']['GoodsReceiptItem'];
type InvoiceRow = FieldOutputTypes['public']['Invoice'];
export type GoodsReceiptWithItems = GoodsReceiptRow & { items: GoodsReceiptItemRow[]; invoice: InvoiceRow | null };

/**
 * Creating a goods receipt is the one place stock actually moves on the
 * inbound side (see the contract comment on `GoodsReceiptItem`):
 *   1. create the receipt + its line items,
 *   2. increment `StockLevel` and append a `STOCK_IN` `StockMovement` per line,
 *   3. auto-generate the `Invoice`,
 *   4. roll the parent `PurchaseOrder.status` forward once every ordered
 *      line is fully received (across this and any prior receipts).
 * All in one transaction.
 */
export async function createGoodsReceipt(
  companyId: string,
  createdBy: string,
  input: CreateGoodsReceiptInput,
): Promise<GoodsReceiptWithItems> {
  const purchaseOrder = await getPurchaseOrderById(companyId, input.purchaseOrderId);
  if (purchaseOrder.status === 'CANCELLED') {
    throw new BadRequestError('Cannot receive against a cancelled purchase order');
  }

  const orderedByItemId = new Map(purchaseOrder.items.map((i) => [i.itemId, Number(i.quantity)]));
  for (const line of input.items) {
    if (!orderedByItemId.has(line.itemId)) {
      throw new BadRequestError(`Item ${line.itemId} is not on this purchase order`);
    }
    await getItemById(companyId, line.itemId);
  }

  // Quantities already received across prior receipts for this PO, per item — read outside the
  // transaction since these rows are already committed; folded together with this receipt's own
  // quantities (in application code) to decide whether the order is now fully received.
  const priorReceipts = await db.orm.public.GoodsReceipt
    .include('items', (branch) => branch.select('itemId', 'quantity'))
    .where((gr) => gr.purchaseOrderId.eq(purchaseOrder.id))
    .all();

  const receivedSoFar = new Map<string, number>();
  for (const receipt of priorReceipts) {
    for (const item of receipt.items) {
      receivedSoFar.set(item.itemId, (receivedSoFar.get(item.itemId) ?? 0) + Number(item.quantity));
    }
  }
  for (const line of input.items) {
    receivedSoFar.set(line.itemId, (receivedSoFar.get(line.itemId) ?? 0) + Number(line.quantity));
  }

  let fullyReceived = true;
  for (const [itemId, orderedQty] of orderedByItemId) {
    if ((receivedSoFar.get(itemId) ?? 0) < orderedQty) {
      fullyReceived = false;
      break;
    }
  }
  const status = fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

  return db.transaction(async (tx) => {
    const receipt = await tx.orm.public.GoodsReceipt.create({
      purchaseOrderId: purchaseOrder.id,
      supplierId: purchaseOrder.supplierId,
      warehouseId: purchaseOrder.warehouseId,
      receivedAt: input.receivedAt,
      status,
      createdBy,
    });

    const items: GoodsReceiptItemRow[] = [];
    let amount = 0;
    for (const line of input.items) {
      const receiptItem = await tx.orm.public.GoodsReceiptItem.create({
        receiptId: receipt.id,
        itemId: line.itemId,
        unitCost: line.unitCost,
        quantity: line.quantity,
        status: 'RECEIVED',
      });
      items.push(receiptItem);
      // Round each line to cents before summing (standard invoicing practice) — unitCost/quantity
      // are exact decimal strings, but JS multiplication is binary float and can produce noise
      // (e.g. 0.1 * 3 -> 0.30000000000000004) that has no business being in a persisted money field.
      amount += Math.round(Number(line.unitCost) * Number(line.quantity) * 100) / 100;

      await recordStockMovement(tx, {
        type: 'STOCK_IN',
        itemId: line.itemId,
        warehouseId: purchaseOrder.warehouseId,
        quantity: Number(line.quantity),
        createdBy,
        receiptItemId: receiptItem.id,
      });
    }

    await tx.orm.public.PurchaseOrder.where((po) => po.id.eq(purchaseOrder.id)).update({ status });

    const invoice = await tx.orm.public.Invoice.create({
      goodsReceiptId: receipt.id,
      // Full id, not a slice: `id` is a UUIDv7, whose leading bits are a millisecond
      // timestamp rather than random — truncating it collides for receipts created
      // close together in time (seen in testing). The full id is unique by construction.
      invoiceNumber: `INV-${receipt.id}`,
      // Round again after summing: summing several clean 2-decimal numbers in binary float
      // can itself reintroduce noise (e.g. 0.1 + 0.2 -> 0.30000000000000004).
      amount: (Math.round(amount * 100) / 100).toString(),
      currency: 'XAF',
      issuedAt: input.receivedAt,
    });

    return { ...receipt, items, invoice };
  });
}

export async function listGoodsReceipts(companyId: string, pagination: PaginationParams) {
  const companySuppliers = await db.orm.public.Supplier.where((s) => s.companyId.eq(companyId)).select('id').all();
  const supplierIds = companySuppliers.map((s) => s.id);

  if (supplierIds.length === 0) {
    return { items: [], meta: buildMeta(pagination, 0) };
  }

  const [items, { total }] = await Promise.all([
    db.orm.public.GoodsReceipt
      .where((gr) => gr.supplierId.in(supplierIds))
      .include('supplier', (s) => s.select('id', 'name'))
      .include('warehouse', (w) => w.select('id', 'name'))
      .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
      .include('purchaseOrder', (po) => po.select('id', 'status'))
      .include('items', (branch) =>
        branch
          .select('id', 'receiptId', 'itemId', 'unitCost', 'quantity', 'status', 'createdAt', 'updatedAt')
          .include('item', (it) => it.select('id', 'name')),
      )
      .include('invoice', (inv) =>
        inv.select('id', 'goodsReceiptId', 'invoiceNumber', 'amount', 'currency', 'issuedAt', 'createdAt', 'updatedAt'),
      )
      .orderBy((gr) => gr.createdAt.desc())
      .offset(pagination.skip)
      .limit(pagination.take)
      .all(),
    db.orm.public.GoodsReceipt.where((gr) => gr.supplierId.in(supplierIds)).aggregate((a) => ({ total: a.count() })),
  ]);

  return { items, meta: buildMeta(pagination, total) };
}

export async function getGoodsReceiptById(companyId: string, id: string): Promise<GoodsReceiptWithItems> {
  const receipt = await db.orm.public.GoodsReceipt
    .include('supplier', (s) => s.select('id', 'name'))
    .include('warehouse', (w) => w.select('id', 'name'))
    .include('creator', (u) => u.select('employeeId', 'firstName', 'lastName'))
    .include('purchaseOrder', (po) => po.select('id', 'status'))
    .include('items', (branch) =>
      branch
        .select('id', 'receiptId', 'itemId', 'unitCost', 'quantity', 'status', 'createdAt', 'updatedAt')
        .include('item', (it) => it.select('id', 'name')),
    )
    .include('invoice', (branch) =>
      branch.select('id', 'goodsReceiptId', 'invoiceNumber', 'amount', 'currency', 'issuedAt', 'createdAt', 'updatedAt'),
    )
    .where((gr) => gr.id.eq(id))
    .first();

  if (!receipt) {
    throw new NotFoundError('Goods receipt not found');
  }
  // Company-scoping goes through the supplier (GoodsReceipt has no companyId of its own).
  await getPurchaseOrderById(companyId, receipt.purchaseOrderId);

  return receipt;
}
