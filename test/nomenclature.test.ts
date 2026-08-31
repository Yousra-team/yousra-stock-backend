import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

async function setupItems(client: ReturnType<typeof authed>, suffix: string) {
  const unit = await client.post('/api/v1/measurements/units').send({
    name: `NomUnit-${suffix}`,
    symbol: `nu-${suffix}`,
    family: 'UNIT',
    factorToBase: 1,
    isBase: false,
  });
  const category = await client.post('/api/v1/catalog/categories').send({ name: `NomCat-${suffix}` });

  const makeItem = async (name: string) => {
    const res = await client.post('/api/v1/catalog/items').send({
      name,
      categoryId: category.body.data.id,
      baseUnitId: unit.body.data.id,
      isStockable: true,
      isBuyable: true,
    });
    return res.body.data.id as string;
  };

  const parentItemId = await makeItem(`Burger-${suffix}`);
  const subItemId = await makeItem(`Bun-${suffix}`);
  return { unitId: unit.body.data.id as string, parentItemId, subItemId };
}

describe('nomenclature', () => {
  it('create draft (v1) → get with lines → activate → create v2 → activate demotes v1', async () => {
    const tenant = await createTestTenant('nom');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { unitId, parentItemId, subItemId } = await setupItems(client, suffix);

    const v1 = await client.post('/api/v1/nomenclature').send({
      itemId: parentItemId,
      notes: 'first cut',
      lines: [{ subItemId, quantity: 1, unitId }],
    });
    expect(v1.status).toBe(201);
    expect(v1.body.data.version).toBe(1);
    expect(v1.body.data.isActive).toBe(false);
    expect(v1.body.data.lines).toHaveLength(1);

    const got = await client.get(`/api/v1/nomenclature/${v1.body.data.id}`);
    expect(got.status).toBe(200);
    expect(got.body.data.lines[0].subItemId).toBe(subItemId);

    const activated = await client.post(`/api/v1/nomenclature/${v1.body.data.id}/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body.data.isActive).toBe(true);

    const v2 = await client.post('/api/v1/nomenclature').send({
      itemId: parentItemId,
      lines: [{ subItemId, quantity: 2, unitId }],
    });
    expect(v2.status).toBe(201);
    expect(v2.body.data.version).toBe(2);

    const activatedV2 = await client.post(`/api/v1/nomenclature/${v2.body.data.id}/activate`);
    expect(activatedV2.status).toBe(200);
    expect(activatedV2.body.data.isActive).toBe(true);

    const v1AfterDemotion = await client.get(`/api/v1/nomenclature/${v1.body.data.id}`);
    expect(v1AfterDemotion.body.data.isActive).toBe(false);
  });

  it('refuses to soft-delete the active version', async () => {
    const tenant = await createTestTenant('nom-delete-active');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { unitId, parentItemId, subItemId } = await setupItems(client, suffix);

    const draft = await client.post('/api/v1/nomenclature').send({
      itemId: parentItemId,
      lines: [{ subItemId, quantity: 1, unitId }],
    });
    await client.post(`/api/v1/nomenclature/${draft.body.data.id}/activate`);

    const deleted = await client.delete(`/api/v1/nomenclature/${draft.body.data.id}`);
    expect(deleted.status).toBe(409);
  });

  it('PATCH only updates notes', async () => {
    const tenant = await createTestTenant('nom-patch');
    const client = authed(tenant.token);
    const suffix = `${Date.now()}`;
    const { unitId, parentItemId, subItemId } = await setupItems(client, suffix);

    const draft = await client.post('/api/v1/nomenclature').send({
      itemId: parentItemId,
      lines: [{ subItemId, quantity: 1, unitId }],
    });

    const patched = await client.patch(`/api/v1/nomenclature/${draft.body.data.id}`).send({ notes: 'updated' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.notes).toBe('updated');
  });
});
