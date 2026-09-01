import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

async function setupProcurementFixtures(client: ReturnType<typeof authed>, suffix: string) {
  const unit = await client.post('/api/v1/measurements/units').send({
    name: `ProcUnit-${suffix}`,
    symbol: `pu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const category = await client.post('/api/v1/catalog/categories').send({ name: `ProcCat-${suffix}` });
  const item = await client.post('/api/v1/catalog/items').send({
    name: `ProcItem-${suffix}`,
    categoryId: category.body.data.id,
    baseUnitId: unit.body.data.id,
    isStockable: true,
    isBuyable: true,
  });
  const supplier = await client.post('/api/v1/suppliers').send({
    name: `ProcSupplier-${suffix}`,
    country: 'Cameroon',
    city: 'Douala',
    address: '1 Supplier St',
    phone: '+237600000020',
    email: `proc-supplier-${suffix}@example.com`,
    type: 'COMPANY',
  });
  const warehouse = await client.post('/api/v1/warehouses').send({ name: `ProcWarehouse-${suffix}` });

  return {
    itemId: item.body.data.id as string,
    supplierId: supplier.body.data.id as string,
    warehouseId: warehouse.body.data.id as string,
  };
}

describe('procurement: purchase order → goods receipt → stock + invoice', () => {
  it('partial then full receipt rolls PO status forward and moves stock correctly', async () => {
    const tenant = await createTestTenant('proc');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, supplierId, warehouseId } = await setupProcurementFixtures(client, suffix);

    const po = await client.post('/api/v1/purchases').send({
      supplierId,
      warehouseId,
      expectedAt: new Date(Date.now() + 86400000).toISOString(),
      items: [{ itemId, unitCost: 100, quantity: 10 }],
    });
    expect(po.status).toBe(201);
    expect(po.body.data.status).toBe('DRAFT');
    expect(po.body.data.reference).toMatch(/^PO-\d{2}-\d{2}-\d{2}-\d{3,}$/);
    const purchaseOrderId = po.body.data.id;

    // Partial receipt: 6 of 10.
    const receipt1 = await client.post('/api/v1/procurement/receipts').send({
      purchaseOrderId,
      receivedAt: new Date().toISOString(),
      items: [{ itemId, unitCost: 100, quantity: 6 }],
    });
    expect(receipt1.status).toBe(201);
    expect(receipt1.body.data.status).toBe('PARTIALLY_RECEIVED');
    expect(receipt1.body.data.invoice.amount).toBe('600');
    expect(receipt1.body.data.reference).toMatch(/^GR-\d{2}-\d{2}-\d{2}-\d{3,}$/);
    expect(receipt1.body.data.invoice.invoiceNumber).toMatch(/^INV-\d{2}-\d{2}-\d{2}-\d{3,}$/);

    const poAfterPartial = await client.get(`/api/v1/purchases/${purchaseOrderId}`);
    expect(poAfterPartial.body.data.status).toBe('PARTIALLY_RECEIVED');

    const levelAfterPartial = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(levelAfterPartial.status).toBe(200);
    expect(levelAfterPartial.body.data.quantity).toBe('6');

    // Final receipt: remaining 4.
    const receipt2 = await client.post('/api/v1/procurement/receipts').send({
      purchaseOrderId,
      receivedAt: new Date().toISOString(),
      items: [{ itemId, unitCost: 100, quantity: 4 }],
    });
    expect(receipt2.status).toBe(201);
    expect(receipt2.body.data.status).toBe('RECEIVED');
    expect(receipt2.body.data.invoice.amount).toBe('400');
    // Second receipt / invoice of the run get their own distinct references.
    expect(receipt2.body.data.reference).not.toBe(receipt1.body.data.reference);
    expect(receipt2.body.data.invoice.invoiceNumber).not.toBe(receipt1.body.data.invoice.invoiceNumber);

    const poAfterFull = await client.get(`/api/v1/purchases/${purchaseOrderId}`);
    expect(poAfterFull.body.data.status).toBe('RECEIVED');

    const levelAfterFull = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(levelAfterFull.body.data.quantity).toBe('10');

    // The STOCK_IN movements should be visible in the ledger.
    const movements = await client.get('/api/v1/stock-movements?pageSize=100');
    const stockInForItem = movements.body.data.filter(
      (m: { itemId: string; type: string }) => m.itemId === itemId && m.type === 'STOCK_IN',
    );
    expect(stockInForItem).toHaveLength(2);
  });

  it('rejects receiving an item that is not on the purchase order', async () => {
    const tenant = await createTestTenant('proc-badline');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, supplierId, warehouseId } = await setupProcurementFixtures(client, suffix);
    const other = await setupProcurementFixtures(client, `${suffix}-other`);

    const po = await client.post('/api/v1/purchases').send({
      supplierId,
      warehouseId,
      expectedAt: new Date(Date.now() + 86400000).toISOString(),
      items: [{ itemId, unitCost: 50, quantity: 5 }],
    });

    const receipt = await client.post('/api/v1/procurement/receipts').send({
      purchaseOrderId: po.body.data.id,
      receivedAt: new Date().toISOString(),
      items: [{ itemId: other.itemId, unitCost: 50, quantity: 1 }],
    });
    expect(receipt.status).toBe(400);
  });

  it('rejects receiving against a cancelled purchase order', async () => {
    const tenant = await createTestTenant('proc-cancelled');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, supplierId, warehouseId } = await setupProcurementFixtures(client, suffix);

    const po = await client.post('/api/v1/purchases').send({
      supplierId,
      warehouseId,
      expectedAt: new Date(Date.now() + 86400000).toISOString(),
      items: [{ itemId, unitCost: 50, quantity: 5 }],
    });
    const cancelled = await client.delete(`/api/v1/purchases/${po.body.data.id}`);
    expect(cancelled.status).toBe(204);

    const receipt = await client.post('/api/v1/procurement/receipts').send({
      purchaseOrderId: po.body.data.id,
      receivedAt: new Date().toISOString(),
      items: [{ itemId, unitCost: 50, quantity: 1 }],
    });
    expect(receipt.status).toBe(400);
  });

  it('invoices are listed and readable read-only', async () => {
    const tenant = await createTestTenant('proc-invoice');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, supplierId, warehouseId } = await setupProcurementFixtures(client, suffix);

    const po = await client.post('/api/v1/purchases').send({
      supplierId,
      warehouseId,
      expectedAt: new Date(Date.now() + 86400000).toISOString(),
      items: [{ itemId, unitCost: 20, quantity: 3 }],
    });
    const receipt = await client.post('/api/v1/procurement/receipts').send({
      purchaseOrderId: po.body.data.id,
      receivedAt: new Date().toISOString(),
      items: [{ itemId, unitCost: 20, quantity: 3 }],
    });

    const invoiceId = receipt.body.data.invoice.id;
    const list = await client.get('/api/v1/procurement/invoices?pageSize=100');
    expect(list.status).toBe(200);
    expect(list.body.data.some((inv: { id: string }) => inv.id === invoiceId)).toBe(true);

    const got = await client.get(`/api/v1/procurement/invoices/${invoiceId}`);
    expect(got.status).toBe(200);
    expect(got.body.data.amount).toBe('60');
    expect(got.body.data.invoiceNumber).toMatch(/^INV-\d{2}-\d{2}-\d{2}-\d{3,}$/);
  });
});
