import { describe, expect, it } from 'vitest';
import { api, authed, createTestTenant } from './helpers';

/**
 * Sets up a tenant with two stockable items, a coded warehouse, opening stock
 * of 50 each, and a registered "Pizzaland" external system.
 */
async function setupExternalFixtures(suffix: string) {
  const tenant = await createTestTenant(`ext-${suffix}`);
  const client = authed(tenant.token);

  const unit = await client.post('/api/v1/measurements/units').send({
    name: `ExtUnit-${suffix}`,
    symbol: `eu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const category = await client.post('/api/v1/catalog/categories').send({ name: `ExtCat-${suffix}` });

  const mkItem = (name: string) =>
    client.post('/api/v1/catalog/items').send({
      name: `${name}-${suffix}`,
      categoryId: category.body.data.id,
      baseUnitId: unit.body.data.id,
      isStockable: true,
      isBuyable: true,
    });
  const pouletL = await mkItem('PouletPaneL');
  const pouletXL = await mkItem('PouletPaneXL');

  const locationCode = `akwa-${suffix}`;
  const warehouse = await client
    .post('/api/v1/warehouses')
    .send({ name: `ExtWarehouse-${suffix}`, code: locationCode });
  expect(warehouse.status).toBe(201);
  expect(warehouse.body.data.code).toBe(locationCode);

  for (const itemId of [pouletL.body.data.id, pouletXL.body.data.id]) {
    const seed = await client.post('/api/v1/stock-movements').send({
      type: 'ADJUSTMENT',
      itemId,
      warehouseId: warehouse.body.data.id,
      quantity: 50,
      direction: 'increase',
    });
    expect(seed.status).toBe(201);
  }

  const systemName = `Pizzaland-${suffix}`;
  const registered = await client.post('/api/v1/integration/systems').send({
    name: systemName,
    description: 'Pizzaland V1 backend',
    phone: '+237600000099',
  });
  expect(registered.status).toBe(201);

  return {
    client,
    systemName,
    apiToken: registered.body.data.apiToken as string,
    locationCode,
    pouletLId: pouletL.body.data.id as string,
    pouletXLId: pouletXL.body.data.id as string,
  };
}

/** Raw supertest call carrying the external-system token instead of a JWT. */
function extPost(url: string, token: string) {
  return api.post(url).set('X-Api-Token', token);
}
function extGet(url: string, token: string) {
  return api.get(url).set('X-Api-Token', token);
}

describe('external stock integration', () => {
  it('reads stock, consumes an order, is idempotent, then releases it', async () => {
    const suffix = `${Date.now()}`;
    const fx = await setupExternalFixtures(suffix);
    const orderRef = `PL-ORDER-${suffix}`;

    // Read
    const read = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId},${fx.pouletXLId}`,
      fx.apiToken,
    );
    expect(read.status).toBe(200);
    expect(read.body.data.warehouseId).toBeDefined();
    const qty = (body: any, itemId: string) =>
      body.data.items.find((i: { itemId: string }) => i.itemId === itemId).quantity;
    expect(qty(read.body, fx.pouletLId)).toBe('50');
    expect(qty(read.body, fx.pouletXLId)).toBe('50');

    // Consume: 2x L + 3x L (same line twice → aggregates to 5) + 1x XL
    const consume = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [
        { itemId: fx.pouletLId, quantity: 2 },
        { itemId: fx.pouletLId, quantity: 3 },
        { itemId: fx.pouletXLId, quantity: 1 },
      ],
    });
    expect(consume.status).toBe(201);
    expect(consume.body.data.replayed).toBe(false);
    expect(consume.body.data.movements).toHaveLength(2);
    expect(consume.body.data.movements.every((m: { type: string }) => m.type === 'SALE')).toBe(true);

    const afterConsume = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId},${fx.pouletXLId}`,
      fx.apiToken,
    );
    expect(qty(afterConsume.body, fx.pouletLId)).toBe('45');
    expect(qty(afterConsume.body, fx.pouletXLId)).toBe('49');

    // Replay: same orderRef → 200, no further decrement
    const replay = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pouletLId, quantity: 5 }, { itemId: fx.pouletXLId, quantity: 1 }],
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);

    const afterReplay = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId},${fx.pouletXLId}`,
      fx.apiToken,
    );
    expect(qty(afterReplay.body, fx.pouletLId)).toBe('45');

    // Release: restores the SALEs
    const release = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
    });
    expect(release.status).toBe(201);
    expect(release.body.data.movements.every((m: { type: string }) => m.type === 'RETURN')).toBe(true);

    const afterRelease = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId},${fx.pouletXLId}`,
      fx.apiToken,
    );
    expect(qty(afterRelease.body, fx.pouletLId)).toBe('50');
    expect(qty(afterRelease.body, fx.pouletXLId)).toBe('50');

    // Release replay
    const releaseAgain = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
    });
    expect(releaseAgain.status).toBe(200);
    expect(releaseAgain.body.data.replayed).toBe(true);

    // The JWT-side ledger attributes the SALE rows to the external system, not a user.
    const ledger = await fx.client.get('/api/v1/stock-movements');
    const saleRow = ledger.body.data.find(
      (m: { type: string; externalRef: string }) => m.type === 'SALE' && m.externalRef === orderRef,
    );
    expect(saleRow).toBeDefined();
    expect(saleRow.createdBy).toBeNull();
    expect(saleRow.createdByExternalSystem.name).toBe(fx.systemName);
  });

  it('rejects an order that exceeds available stock with 409 and moves nothing', async () => {
    const suffix = `${Date.now()}-over`;
    const fx = await setupExternalFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `PL-OVER-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pouletLId, quantity: 999 }],
    });
    expect(res.status).toBe(409);

    const read = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId}`,
      fx.apiToken,
    );
    expect(read.body.data.items[0].quantity).toBe('50');
  });

  it('rejects a bad token (401) and a name that does not match the token (401)', async () => {
    const suffix = `${Date.now()}-auth`;
    const fx = await setupExternalFixtures(suffix);

    const badToken = await extGet(
      `/api/v1/external/stock?system=${encodeURIComponent(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${fx.pouletLId}`,
      'not-a-real-token',
    );
    expect(badToken.status).toBe(401);

    const wrongName = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: 'SomeOtherSystem',
      orderRef: `PL-AUTH-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pouletLId, quantity: 1 }],
    });
    expect(wrongName.status).toBe(401);
  });

  it('rejects release for an order that was never consumed (404)', async () => {
    const suffix = `${Date.now()}-norel`;
    const fx = await setupExternalFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `PL-GHOST-${suffix}`,
    });
    expect(res.status).toBe(404);
  });
});
