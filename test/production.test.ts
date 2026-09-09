import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

/**
 * dough (STOCKED semi-finished) = 3 flour; flour (STOCKED raw, opening 100).
 * A production run of dough consumes flour and adds dough — the only place the
 * flour behind the dough is ever drawn down.
 */
async function setupFixtures(suffix: string) {
  const tenant = await createTestTenant(`prod-${suffix}`);
  const client = authed(tenant.token);

  const unit = await client.post('/api/v1/measurements/units').send({
    name: `ProdU-${suffix}`,
    symbol: `pu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const unitId = unit.body.data.id as string;
  const category = await client.post('/api/v1/catalog/categories').send({ name: `ProdC-${suffix}` });
  const categoryId = category.body.data.id as string;

  const mkItem = (name: string): Promise<string> =>
    client
      .post('/api/v1/catalog/items')
      .send({ name: `${name}-${suffix}`, categoryId, baseUnitId: unitId, isStockable: true, isBuyable: false })
      .then((r) => r.body.data.id as string);

  const flourId = await mkItem('Flour');
  const doughId = await mkItem('Dough');
  const noRecipeId = await mkItem('NoRecipe');

  const doughNom = await client
    .post('/api/v1/nomenclature')
    .send({ itemId: doughId, lines: [{ subItemId: flourId, quantity: 3, unitId }] });
  await client.post(`/api/v1/nomenclature/${doughNom.body.data.id}/activate`);

  const warehouse = await client.post('/api/v1/warehouses').send({ name: `ProdW-${suffix}` });
  const warehouseId = warehouse.body.data.id as string;

  const seed = await client.post('/api/v1/stock-movements').send({
    type: 'ADJUSTMENT',
    itemId: flourId,
    warehouseId,
    quantity: 100,
    direction: 'increase',
  });
  expect(seed.status).toBe(201);

  return { client, warehouseId, flourId, doughId, noRecipeId, doughNomId: doughNom.body.data.id as string };
}

describe('production runs', () => {
  it('consumes recipe inputs and adds the produced batch in one transaction', async () => {
    const fx = await setupFixtures(`${Date.now()}`);

    const res = await fx.client.post('/api/v1/production').send({
      itemId: fx.doughId,
      warehouseId: fx.warehouseId,
      quantity: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.produced.type).toBe('PRODUCTION');
    expect(res.body.data.produced.itemId).toBe(fx.doughId);
    expect(res.body.data.produced.quantity).toBe('10');
    expect(res.body.data.produced.nomenclatureId).toBe(fx.doughNomId);

    expect(res.body.data.consumed).toHaveLength(1);
    expect(res.body.data.consumed[0].type).toBe('CONSUMPTION');
    expect(res.body.data.consumed[0].itemId).toBe(fx.flourId);
    expect(res.body.data.consumed[0].quantity).toBe('30');

    const flour = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.flourId}`);
    expect(flour.body.data.quantity).toBe('70');
    const dough = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.doughId}`);
    expect(dough.body.data.quantity).toBe('10');
  }, 90_000);

  it('409 when there is not enough input stock — nothing is moved', async () => {
    const fx = await setupFixtures(`${Date.now()}-short`);

    const res = await fx.client.post('/api/v1/production').send({
      itemId: fx.doughId,
      warehouseId: fx.warehouseId,
      quantity: 100, // needs 300 flour, only 100 in stock
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(fx.flourId);

    const flour = await fx.client.get(`/api/v1/stock-levels/${fx.warehouseId}/${fx.flourId}`);
    expect(flour.body.data.quantity).toBe('100');
  }, 90_000);

  it('409 when the item has no active recipe to produce from', async () => {
    const fx = await setupFixtures(`${Date.now()}-nr`);

    const res = await fx.client.post('/api/v1/production').send({
      itemId: fx.noRecipeId,
      warehouseId: fx.warehouseId,
      quantity: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no active recipe/i);
  }, 90_000);
});
