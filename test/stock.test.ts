import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

async function setupStockFixtures(client: ReturnType<typeof authed>, suffix: string) {
  const unit = await client.post('/api/v1/measurements/units').send({
    name: `StockUnit-${suffix}`,
    symbol: `su-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const category = await client.post('/api/v1/catalog/categories').send({ name: `StockCat-${suffix}` });
  const item = await client.post('/api/v1/catalog/items').send({
    name: `StockItem-${suffix}`,
    categoryId: category.body.data.id,
    baseUnitId: unit.body.data.id,
    isStockable: true,
    isBuyable: true,
  });
  const warehouse = await client.post('/api/v1/warehouses').send({ name: `StockWarehouse-${suffix}` });

  return {
    unitId: unit.body.data.id as string,
    itemId: item.body.data.id as string,
    warehouseId: warehouse.body.data.id as string,
  };
}

describe('stock levels + movements', () => {
  it('a never-touched (warehouse, item) pair reads as zero, not 404', async () => {
    const tenant = await createTestTenant('stock-zero');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, warehouseId } = await setupStockFixtures(client, suffix);

    const res = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe('0');
  });

  it('ADJUSTMENT increase, then MANUAL_OUT decrease, update the stock level', async () => {
    const tenant = await createTestTenant('stock-adjust');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, warehouseId } = await setupStockFixtures(client, suffix);

    const increase = await client.post('/api/v1/stock-movements').send({
      type: 'ADJUSTMENT',
      itemId,
      warehouseId,
      quantity: 20,
      direction: 'increase',
    });
    expect(increase.status).toBe(201);

    const afterIncrease = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(afterIncrease.body.data.quantity).toBe('20');

    const decrease = await client.post('/api/v1/stock-movements').send({
      type: 'MANUAL_OUT',
      itemId,
      warehouseId,
      quantity: 5,
      reason: 'INTERNAL_USE',
    });
    expect(decrease.status).toBe(201);

    const afterDecrease = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(afterDecrease.body.data.quantity).toBe('15');

    const gotMovement = await client.get(`/api/v1/stock-movements/${decrease.body.data.id}`);
    expect(gotMovement.status).toBe(200);
    expect(gotMovement.body.data.reason).toBe('INTERNAL_USE');
  });

  it('rejects a movement that would take stock negative', async () => {
    const tenant = await createTestTenant('stock-insufficient');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, warehouseId } = await setupStockFixtures(client, suffix);

    const res = await client.post('/api/v1/stock-movements').send({
      type: 'MANUAL_OUT',
      itemId,
      warehouseId,
      quantity: 1000,
      reason: 'OTHER',
    });
    expect(res.status).toBe(409);
  });

  it('CONSUMPTION requires and records a nomenclatureId', async () => {
    const tenant = await createTestTenant('stock-consumption');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { unitId, itemId, warehouseId } = await setupStockFixtures(client, suffix);

    await client.post('/api/v1/stock-movements').send({
      type: 'ADJUSTMENT',
      itemId,
      warehouseId,
      quantity: 10,
      direction: 'increase',
    });

    const nomenclature = await client
      .post('/api/v1/nomenclature')
      .send({ itemId, lines: [{ subItemId: itemId, quantity: 1, unitId }] });
    expect(nomenclature.status).toBe(201);

    const consumption = await client.post('/api/v1/stock-movements').send({
      type: 'CONSUMPTION',
      itemId,
      warehouseId,
      quantity: 2,
      nomenclatureId: nomenclature.body.data.id,
    });
    expect(consumption.status).toBe(201);
    expect(consumption.body.data.nomenclatureId).toBe(nomenclature.body.data.id);

    const level = await client.get(`/api/v1/stock-levels/${warehouseId}/${itemId}`);
    expect(level.body.data.quantity).toBe('8');
  });

  it('rejects a movement payload missing the type-specific required field', async () => {
    const tenant = await createTestTenant('stock-validate');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { itemId, warehouseId } = await setupStockFixtures(client, suffix);

    // MANUAL_OUT with no `reason`.
    const res = await client.post('/api/v1/stock-movements').send({ type: 'MANUAL_OUT', itemId, warehouseId, quantity: 1 });
    expect(res.status).toBe(400);
  });
});
