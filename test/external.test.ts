import { describe, expect, it } from 'vitest';
import { api, authed, createTestTenant } from './helpers';

/**
 * Model A fixtures: a 2-level recipe (pizza = 1 dough + 2 cheese; dough = 3 flour),
 * the raw ingredients (flour, cheese) stocked at 100 each in a coded warehouse,
 * a finished item with NO recipe, and a registered "Pizzaland" external system.
 *
 * All items share one UNIT-family unit so no conversion is involved — conversion
 * itself is covered by `measurements.test.ts`.
 */
async function setupModelAFixtures(suffix: string) {
  const tenant = await createTestTenant(`exta-${suffix}`);
  const client = authed(tenant.token);

  const unit = await client.post('/api/v1/measurements/units').send({
    name: `ExtAUnit-${suffix}`,
    symbol: `eau-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const unitId = unit.body.data.id as string;
  const category = await client.post('/api/v1/catalog/categories').send({ name: `ExtACat-${suffix}` });
  const categoryId = category.body.data.id as string;

  const mkItem = (name: string, isStockable: boolean): Promise<string> =>
    client
      .post('/api/v1/catalog/items')
      .send({ name: `${name}-${suffix}`, categoryId, baseUnitId: unitId, isStockable, isBuyable: false })
      .then((r) => r.body.data.id as string);

  const flourId = await mkItem('Flour', true);
  const cheeseId = await mkItem('Cheese', true);
  const doughId = await mkItem('Dough', false);
  const pizzaId = await mkItem('Pizza', false);
  const plainId = await mkItem('PlainNoRecipe', false);

  const doughNom = await client
    .post('/api/v1/nomenclature')
    .send({ itemId: doughId, lines: [{ subItemId: flourId, quantity: 3, unitId }] });
  await client.post(`/api/v1/nomenclature/${doughNom.body.data.id}/activate`);

  const pizzaNom = await client.post('/api/v1/nomenclature').send({
    itemId: pizzaId,
    lines: [
      { subItemId: doughId, quantity: 1, unitId },
      { subItemId: cheeseId, quantity: 2, unitId },
    ],
  });
  await client.post(`/api/v1/nomenclature/${pizzaNom.body.data.id}/activate`);

  const locationCode = `exta-${suffix}`;
  const warehouse = await client
    .post('/api/v1/warehouses')
    .send({ name: `ExtAWh-${suffix}`, code: locationCode });
  const warehouseId = warehouse.body.data.id as string;
  for (const itemId of [flourId, cheeseId]) {
    const seed = await client.post('/api/v1/stock-movements').send({
      type: 'ADJUSTMENT',
      itemId,
      warehouseId,
      quantity: 100,
      direction: 'increase',
    });
    expect(seed.status).toBe(201);
  }

  const systemName = `PizzalandA-${suffix}`;
  const registered = await client.post('/api/v1/integration/systems').send({
    name: systemName,
    description: 'Pizzaland V1 (model A)',
    phone: '+237600000098',
  });
  expect(registered.status).toBe(201);

  return {
    client,
    systemName,
    apiToken: registered.body.data.apiToken as string,
    locationCode,
    warehouseId,
    flourId,
    cheeseId,
    doughId,
    pizzaId,
    plainId,
    pizzaNomId: pizzaNom.body.data.id as string,
  };
}

const enc = encodeURIComponent;
const extPost = (url: string, token: string) => api.post(url).set('X-Api-Token', token);
const extGet = (url: string, token: string) => api.get(url).set('X-Api-Token', token);

function stockUrl(fx: { systemName: string; locationCode: string }, itemIds: string[]): string {
  return `/api/v1/external/stock?system=${enc(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${itemIds.join(',')}`;
}

describe('external stock integration (recipe-based)', () => {
  it('explodes a recursive recipe on consume, is idempotent, then release restores ingredients', async () => {
    const suffix = `${Date.now()}`;
    const fx = await setupModelAFixtures(suffix);
    const orderRef = `A-${suffix}`;

    // Buildable before: flour 100 / 3-per-pizza = 33; cheese 100 / 2 = 50 -> min 33.
    const read0 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read0.status).toBe(200);
    expect(read0.body.data.items[0].quantity).toBe('33');

    // Order 2 pizzas -> 6 flour (via dough) + 4 cheese consumed.
    const consume = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 2 }],
    });
    expect(consume.status).toBe(201);
    expect(consume.body.data.replayed).toBe(false);
    expect(consume.body.data.movements.every((m: { type: string }) => m.type === 'CONSUMPTION')).toBe(true);

    const movements = consume.body.data.movements as Array<{ itemId: string; quantity: string }>;
    const movFor = (itemId: string) => movements.find((m) => m.itemId === itemId);
    expect(movFor(fx.flourId)?.quantity).toBe('6');
    expect(movFor(fx.cheeseId)?.quantity).toBe('4');
    expect(movFor(fx.pizzaId)).toBeUndefined();
    expect(movFor(fx.doughId)).toBeUndefined();

    // Buildable now: floor((100 - 6) / 3) = 31 — confirms flour was decremented via the sub-recipe.
    const read1 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read1.body.data.items[0].quantity).toBe('31');

    // Replay: same orderRef -> 200, no further decrement.
    const replay = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 2 }],
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);

    // Release: RETURN per CONSUMPTION -> buildable back to 33.
    const release = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
    });
    expect(release.status).toBe(201);
    expect(release.body.data.movements.every((m: { type: string }) => m.type === 'RETURN')).toBe(true);
    const read2 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read2.body.data.items[0].quantity).toBe('33');

    // Release replay.
    const releaseAgain = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
    });
    expect(releaseAgain.status).toBe(200);
    expect(releaseAgain.body.data.replayed).toBe(true);

    // Ledger: CONSUMPTION rows attributed to the external system, tagged with the pizza recipe.
    const ledger = await fx.client.get('/api/v1/stock-movements');
    const consRow = ledger.body.data.find(
      (m: { type: string; externalRef: string }) => m.type === 'CONSUMPTION' && m.externalRef === orderRef,
    );
    expect(consRow).toBeDefined();
    expect(consRow.createdBy).toBeNull();
    expect(consRow.createdByExternalSystem.name).toBe(fx.systemName);
    expect(consRow.nomenclature.id).toBe(fx.pizzaNomId);
  }, 90_000);

  it('rejects an order whose recipe needs more ingredient than is in stock (409, nothing moved)', async () => {
    const suffix = `${Date.now()}-short`;
    const fx = await setupModelAFixtures(suffix);

    // 50 pizzas need 150 flour; only 100 in stock.
    const res = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-SHORT-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 50 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(fx.flourId);

    const flour = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.flourId}`);
    expect(flour.body.data.quantity).toBe('100');
  }, 90_000);

  it('rejects an ordered item that has no active recipe (409 NO_RECIPE)', async () => {
    const suffix = `${Date.now()}-norecipe`;
    const fx = await setupModelAFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-NR-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.plainId, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RECIPE');
  }, 90_000);

  it('rejects a bad token (401) and a name that does not match the token (401)', async () => {
    const suffix = `${Date.now()}-auth`;
    const fx = await setupModelAFixtures(suffix);

    const badToken = await extGet(stockUrl(fx, [fx.pizzaId]), 'not-a-real-token');
    expect(badToken.status).toBe(401);

    const wrongName = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: 'SomeOtherSystem',
      orderRef: `A-AUTH-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 1 }],
    });
    expect(wrongName.status).toBe(401);
  }, 90_000);

  it('rejects release for an order that was never consumed (404)', async () => {
    const suffix = `${Date.now()}-norel`;
    const fx = await setupModelAFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-GHOST-${suffix}`,
    });
    expect(res.status).toBe(404);
  }, 90_000);
});
