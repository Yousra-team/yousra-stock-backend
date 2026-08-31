import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

describe('warehouses', () => {
  it('create → list → get → update → soft-delete lifecycle', async () => {
    const tenant = await createTestTenant('wh');
    const client = authed(tenant.token);

    const created = await client.post('/api/v1/warehouses').send({ name: 'Main Depot' });
    expect(created.status).toBe(201);
    const warehouseId = created.body.data.id;

    const list = await client.get('/api/v1/warehouses');
    expect(list.status).toBe(200);
    expect(list.body.data.some((w: { id: string }) => w.id === warehouseId)).toBe(true);

    const updated = await client.patch(`/api/v1/warehouses/${warehouseId}`).send({ name: 'Main Depot Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Main Depot Renamed');

    const deleted = await client.delete(`/api/v1/warehouses/${warehouseId}`);
    expect(deleted.status).toBe(204);

    const afterDelete = await client.get(`/api/v1/warehouses/${warehouseId}`);
    expect(afterDelete.status).toBe(404);
  });
});
