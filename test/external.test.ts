import { describe, expect, it } from 'vitest';
import { api, authed, createTestTenant } from './helpers';

/**
 * Model A fixtures. Recipe tree for "pizza":
 *   pizza  (NOT stocked)  = 1 dough + 2 cheese + 0.5 garlic paste
 *   dough  (STOCKED, semi-finished, opening 20) = 3 flour     ← recipe NOT followed by consume
 *   garlic paste (NOT stocked, phantom)         = 1 garlic    ← recipe IS followed by consume
 *   flour / cheese / garlic  (STOCKED raw, opening 100)
 *
 * So consuming a pizza draws down dough + cheese + garlic, never flour.
 * One shared UNIT-family unit → no conversion (that is covered by measurements.test.ts).
 */
async function setupFixtures(suffix: string) {
  const tenant = await createTestTenant(`ext-${suffix}`);
  const client = authed(tenant.token);

  const unit = await client.post('/api/v1/measurements/units').send({
    name: `ExtU-${suffix}`,
    symbol: `eu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const unitId = unit.body.data.id as string;
  const category = await client.post('/api/v1/catalog/categories').send({ name: `ExtC-${suffix}` });
  const categoryId = category.body.data.id as string;

  const mkItem = (name: string, isStockable: boolean): Promise<string> =>
    client
      .post('/api/v1/catalog/items')
      .send({ name: `${name}-${suffix}`, categoryId, baseUnitId: unitId, isStockable, isBuyable: false })
      .then((r) => r.body.data.id as string);

  const flourId = await mkItem('Flour', true);
  const cheeseId = await mkItem('Cheese', true);
  const garlicId = await mkItem('Garlic', true);
  const doughId = await mkItem('Dough', true); // semi-finished — STOCKED
  const pasteId = await mkItem('GarlicPaste', false); // phantom — NOT stocked
  const pizzaId = await mkItem('Pizza', false);
  const plainId = await mkItem('PlainNoRecipe', false);

  const activate = (nomId: string) => client.post(`/api/v1/nomenclature/${nomId}/activate`);

  const doughNom = await client
    .post('/api/v1/nomenclature')
    .send({ itemId: doughId, lines: [{ subItemId: flourId, quantity: 3, unitId }] });
  await activate(doughNom.body.data.id);

  const pasteNom = await client
    .post('/api/v1/nomenclature')
    .send({ itemId: pasteId, lines: [{ subItemId: garlicId, quantity: 1, unitId }] });
  await activate(pasteNom.body.data.id);

  const pizzaNom = await client.post('/api/v1/nomenclature').send({
    itemId: pizzaId,
    lines: [
      { subItemId: doughId, quantity: 1, unitId },
      { subItemId: cheeseId, quantity: 2, unitId },
      { subItemId: pasteId, quantity: 0.5, unitId },
    ],
  });
  await activate(pizzaNom.body.data.id);

  const locationCode = `ext-${suffix}`;
  const warehouse = await client
    .post('/api/v1/warehouses')
    .send({ name: `ExtW-${suffix}`, code: locationCode });
  const warehouseId = warehouse.body.data.id as string;

  const seed = async (itemId: string, quantity: number) => {
    const r = await client.post('/api/v1/stock-movements').send({
      type: 'ADJUSTMENT',
      itemId,
      warehouseId,
      quantity,
      direction: 'increase',
    });
    expect(r.status).toBe(201);
  };
  await seed(flourId, 100);
  await seed(cheeseId, 100);
  await seed(garlicId, 100);
  await seed(doughId, 20);

  const systemName = `Pizzaland-${suffix}`;
  const registered = await client.post('/api/v1/integration/systems').send({
    name: systemName,
    description: 'Pizzaland V1',
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
    garlicId,
    doughId,
    pizzaId,
    plainId,
    pizzaNomId: pizzaNom.body.data.id as string,
  };
}

const enc = encodeURIComponent;
const extPost = (url: string, token: string) => api.post(url).set('X-Api-Token', token);
const extGet = (url: string, token: string) => api.get(url).set('X-Api-Token', token);
const stockUrl = (fx: { systemName: string; locationCode: string }, ids: string[]) =>
  `/api/v1/external/stock?system=${enc(fx.systemName)}&locationCode=${fx.locationCode}&itemIds=${ids.join(',')}`;

describe('external stock integration (recipe-based, stops at stocked items)', () => {
  it('consume draws down the stocked components — semi-finished + phantom-explosion — never the flour behind the dough', async () => {
    const suffix = `${Date.now()}`;
    const fx = await setupFixtures(suffix);
    const orderRef = `A-${suffix}`;

    // Buildable = min(dough 20/1, cheese 100/2, garlic 100/0.5) = 20.
    const read0 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read0.status).toBe(200);
    expect(read0.body.data.items[0].quantity).toBe('20');

    const consume = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 2 }],
    });
    expect(consume.status).toBe(201);
    const moves = consume.body.data.movements as Array<{ itemId: string; quantity: string; type: string }>;
    expect(moves.every((m) => m.type === 'CONSUMPTION')).toBe(true);
    const q = (id: string) => moves.find((m) => m.itemId === id)?.quantity;
    expect(q(fx.doughId)).toBe('2'); // stopped at the semi-finished good
    expect(q(fx.cheeseId)).toBe('4');
    expect(q(fx.garlicId)).toBe('1'); // reached through the phantom paste
    expect(q(fx.flourId)).toBeUndefined(); // the flour behind the dough is untouched

    // Flour stock unchanged; dough went 20 -> 18 so buildable is now 18.
    const flour = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.flourId}`);
    expect(flour.body.data.quantity).toBe('100');
    const read1 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read1.body.data.items[0].quantity).toBe('18');

    // Replay -> 200, no further movement.
    const replay = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 2 }],
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);

    // Release -> RETURN per CONSUMPTION, buildable back to 20.
    const release = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef,
    });
    expect(release.status).toBe(201);
    expect(release.body.data.movements.every((m: { type: string }) => m.type === 'RETURN')).toBe(true);
    const read2 = await extGet(stockUrl(fx, [fx.pizzaId]), fx.apiToken);
    expect(read2.body.data.items[0].quantity).toBe('20');

    // Ledger attribution + recipe tag.
    const ledger = await fx.client.get('/api/v1/stock-movements');
    const row = ledger.body.data.find(
      (m: { type: string; externalRef: string }) => m.type === 'CONSUMPTION' && m.externalRef === orderRef,
    );
    expect(row.createdBy).toBeNull();
    expect(row.createdByExternalSystem.name).toBe(fx.systemName);
    expect(row.nomenclature.id).toBe(fx.pizzaNomId);
  }, 90_000);

  it('409 when a stocked component (the dough) is short — and it names the dough, not the flour', async () => {
    const suffix = `${Date.now()}-short`;
    const fx = await setupFixtures(suffix);

    // 25 pizzas need 25 dough; only 20 in stock.
    const res = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-SHORT-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 25 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(fx.doughId);
    expect(res.body.error.message).not.toContain(fx.flourId);

    const dough = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.doughId}`);
    expect(dough.body.data.quantity).toBe('20');
  }, 90_000);

  it('409 NO_RECIPE for a non-stocked item with no active recipe', async () => {
    const suffix = `${Date.now()}-nr`;
    const fx = await setupFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-NR-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.plainId, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RECIPE');
  }, 90_000);

  it('401 on a bad token and on a name that does not match the token', async () => {
    const suffix = `${Date.now()}-auth`;
    const fx = await setupFixtures(suffix);

    const bad = await extGet(stockUrl(fx, [fx.pizzaId]), 'not-a-real-token');
    expect(bad.status).toBe(401);

    const wrongName = await extPost('/api/v1/external/stock/consume', fx.apiToken).send({
      system: 'SomeOtherSystem',
      orderRef: `A-AUTH-${suffix}`,
      locationCode: fx.locationCode,
      lines: [{ itemId: fx.pizzaId, quantity: 1 }],
    });
    expect(wrongName.status).toBe(401);
  }, 90_000);

  it('404 on release for an order that was never consumed', async () => {
    const suffix = `${Date.now()}-norel`;
    const fx = await setupFixtures(suffix);

    const res = await extPost('/api/v1/external/stock/release', fx.apiToken).send({
      system: fx.systemName,
      orderRef: `A-GHOST-${suffix}`,
    });
    expect(res.status).toBe(404);
  }, 90_000);
});
