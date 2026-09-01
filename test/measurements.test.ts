import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

// Units are global reference data (no companyId) — every test uses a
// timestamp-suffixed name/symbol so repeat runs against the same shared dev
// DB don't collide with earlier runs' rows.
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

describe('measurements (units)', () => {
  it('create → list → get → update → soft-delete lifecycle', async () => {
    const tenant = await createTestTenant('unit-crud');
    const client = authed(tenant.token);
    const suffix = uniqueSuffix();

    const created = await client.post('/api/v1/measurements/units').send({
      name: `TestGram-${suffix}`,
      symbol: `tg-${suffix}`,
      family: 'MASS',
      factorToBase: 0.001,
      isBase: false,
    });
    expect(created.status).toBe(201);
    const unitId = created.body.data.id;

    const list = await client.get('/api/v1/measurements/units?page=1&pageSize=50');
    expect(list.status).toBe(200);
    expect(list.body.data.some((u: { id: string }) => u.id === unitId)).toBe(true);

    const got = await client.get(`/api/v1/measurements/units/${unitId}`);
    expect(got.status).toBe(200);
    expect(got.body.data.factorToBase).toBe('0.001');

    const updated = await client.patch(`/api/v1/measurements/units/${unitId}`).send({ symbol: `tg2-${suffix}` });
    expect(updated.status).toBe(200);
    expect(updated.body.data.symbol).toBe(`tg2-${suffix}`);

    const deleted = await client.delete(`/api/v1/measurements/units/${unitId}`);
    expect(deleted.status).toBe(204);

    // Soft delete must remove the unit from every read path so the client
    // dropdown stops offering it.
    const listAfter = await client.get('/api/v1/measurements/units?page=1&pageSize=100');
    expect(listAfter.body.data.some((u: { id: string }) => u.id === unitId)).toBe(false);

    const getAfter = await client.get(`/api/v1/measurements/units/${unitId}`);
    expect(getAfter.status).toBe(404);
  });

  it('refuses to delete a unit that an item still references', async () => {
    const tenant = await createTestTenant('unit-in-use');
    const client = authed(tenant.token);
    const suffix = uniqueSuffix();

    const unit = await client.post('/api/v1/measurements/units').send({
      name: `InUse-${suffix}`,
      symbol: `iu-${suffix}`,
      family: 'UNIT',
      factorToBase: 1,
      isBase: false,
    });
    expect(unit.status).toBe(201);
    const unitId = unit.body.data.id;

    const category = await client.post('/api/v1/catalog/categories').send({ name: `InUseCat-${suffix}` });
    const item = await client.post('/api/v1/catalog/items').send({
      name: `InUseItem-${suffix}`,
      categoryId: category.body.data.id,
      baseUnitId: unitId,
      isStockable: true,
      isBuyable: true,
    });
    expect(item.status).toBe(201);

    const blocked = await client.delete(`/api/v1/measurements/units/${unitId}`);
    expect(blocked.status).toBe(409);

    // Once the referencing item is gone, the unit can be deleted.
    const itemDeleted = await client.delete(`/api/v1/catalog/items/${item.body.data.id}`);
    expect(itemDeleted.status).toBe(204);

    const nowDeleted = await client.delete(`/api/v1/measurements/units/${unitId}`);
    expect(nowDeleted.status).toBe(204);
  });

  it('converts between two units of the same family via factorToBase', async () => {
    const tenant = await createTestTenant('unit-convert');
    const client = authed(tenant.token);
    const suffix = uniqueSuffix();

    // 1 kg-like unit = 1 base; 1 g-like unit = 0.001 base.
    const kg = await client.post('/api/v1/measurements/units').send({
      name: `TestKg-${suffix}`,
      symbol: `tkg-${suffix}`,
      family: 'MASS',
      factorToBase: 1,
      isBase: false,
    });
    const g = await client.post('/api/v1/measurements/units').send({
      name: `TestG-${suffix}`,
      symbol: `tg-${suffix}`,
      family: 'MASS',
      factorToBase: 0.001,
      isBase: false,
    });
    expect(kg.status).toBe(201);
    expect(g.status).toBe(201);

    const res = await client.get(
      `/api/v1/measurements/units/convert?fromUnitId=${kg.body.data.id}&toUnitId=${g.body.data.id}&quantity=2`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.result).toBeCloseTo(2000, 6);
  });

  it('rejects converting between different families', async () => {
    const tenant = await createTestTenant('unit-convert-mismatch');
    const client = authed(tenant.token);
    const suffix = uniqueSuffix();

    const mass = await client.post('/api/v1/measurements/units').send({
      name: `TestMass-${suffix}`,
      symbol: `tm-${suffix}`,
      family: 'MASS',
      factorToBase: 1,
      isBase: false,
    });
    const volume = await client.post('/api/v1/measurements/units').send({
      name: `TestVolume-${suffix}`,
      symbol: `tv-${suffix}`,
      family: 'VOLUME',
      factorToBase: 1,
      isBase: false,
    });

    const res = await client.get(
      `/api/v1/measurements/units/convert?fromUnitId=${mass.body.data.id}&toUnitId=${volume.body.data.id}&quantity=1`,
    );
    expect(res.status).toBe(400);
  });

  it('enforces at most one base unit per family', async () => {
    const tenant = await createTestTenant('unit-base-conflict');
    const client = authed(tenant.token);
    const suffix = uniqueSuffix();

    const makeBase = () =>
      client.post('/api/v1/measurements/units').send({
        name: `TestBaseVolume-${suffix}-${Math.random()}`,
        symbol: `tbv-${suffix}-${Math.random()}`,
        family: 'VOLUME',
        factorToBase: 1,
        isBase: true,
      });

    const first = await makeBase();
    if (first.status === 201) {
      const second = await makeBase();
      expect(second.status).toBe(409);
    } else {
      // A VOLUME base unit already existed from prior data — the constraint still held on the first attempt.
      expect(first.status).toBe(409);
    }
  });
});
