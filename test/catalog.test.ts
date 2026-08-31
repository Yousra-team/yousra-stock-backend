import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

async function makeUnit(client: ReturnType<typeof authed>, suffix: string) {
  const res = await client.post('/api/v1/measurements/units').send({
    name: `CatalogUnit-${suffix}`,
    symbol: `cu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  return res.body.data.id as string;
}

describe('catalog', () => {
  it('categories: create → list → get → update → soft-delete', async () => {
    const tenant = await createTestTenant('cat');
    const client = authed(tenant.token);

    const created = await client.post('/api/v1/catalog/categories').send({ name: 'Beverages' });
    expect(created.status).toBe(201);
    const categoryId = created.body.data.id;

    const list = await client.get('/api/v1/catalog/categories');
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { id: string }) => c.id === categoryId)).toBe(true);

    const updated = await client.patch(`/api/v1/catalog/categories/${categoryId}`).send({ name: 'Drinks' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Drinks');

    const deleted = await client.delete(`/api/v1/catalog/categories/${categoryId}`);
    expect(deleted.status).toBe(204);
  });

  it('items: create requires a valid categoryId and baseUnitId', async () => {
    const tenant = await createTestTenant('item-fk');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const unitId = await makeUnit(client, suffix);

    const badCategory = await client.post('/api/v1/catalog/items').send({
      name: 'Bad Item',
      categoryId: '00000000-0000-0000-0000-000000000000',
      baseUnitId: unitId,
      isStockable: true,
      isBuyable: true,
    });
    expect(badCategory.status).toBe(404);

    const category = await client.post('/api/v1/catalog/categories').send({ name: `Ingredients-${suffix}` });
    const badUnit = await client.post('/api/v1/catalog/items').send({
      name: 'Bad Item 2',
      categoryId: category.body.data.id,
      baseUnitId: '00000000-0000-0000-0000-000000000000',
      isStockable: true,
      isBuyable: true,
    });
    expect(badUnit.status).toBe(404);
  });

  it('items: full create → list → get → update → soft-delete lifecycle', async () => {
    const tenant = await createTestTenant('item-crud');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const unitId = await makeUnit(client, suffix);
    const category = await client.post('/api/v1/catalog/categories').send({ name: `Snacks-${suffix}` });

    const created = await client.post('/api/v1/catalog/items').send({
      name: 'Flour',
      categoryId: category.body.data.id,
      baseUnitId: unitId,
      isStockable: true,
      isBuyable: true,
      reorderThreshold: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.reorderThreshold).toBe('10');
    const itemId = created.body.data.id;

    const got = await client.get(`/api/v1/catalog/items/${itemId}`);
    expect(got.status).toBe(200);

    const updated = await client.patch(`/api/v1/catalog/items/${itemId}`).send({ isBuyable: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isBuyable).toBe(false);

    const deleted = await client.delete(`/api/v1/catalog/items/${itemId}`);
    expect(deleted.status).toBe(204);
  });
});
