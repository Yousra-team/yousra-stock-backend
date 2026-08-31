import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

describe('suppliers', () => {
  it('create → list → get → update → soft-delete lifecycle', async () => {
    const tenant = await createTestTenant('sup');
    const client = authed(tenant.token);

    const created = await client.post('/api/v1/suppliers').send({
      name: 'Acme Supplies',
      country: 'Cameroon',
      city: 'Douala',
      address: '10 Industrial Ave',
      phone: '+237600000010',
      email: 'acme@example.com',
      type: 'COMPANY',
    });
    expect(created.status).toBe(201);
    const supplierId = created.body.data.id;

    const list = await client.get('/api/v1/suppliers?page=1&pageSize=20');
    expect(list.status).toBe(200);
    expect(list.body.data.some((s: { id: string }) => s.id === supplierId)).toBe(true);
    expect(list.body.meta.page).toBe(1);

    const got = await client.get(`/api/v1/suppliers/${supplierId}`);
    expect(got.status).toBe(200);
    expect(got.body.data.name).toBe('Acme Supplies');

    const updated = await client.patch(`/api/v1/suppliers/${supplierId}`).send({ city: 'Yaoundé' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.city).toBe('Yaoundé');

    const deleted = await client.delete(`/api/v1/suppliers/${supplierId}`);
    expect(deleted.status).toBe(204);

    const afterDelete = await client.get(`/api/v1/suppliers/${supplierId}`);
    expect(afterDelete.status).toBe(404);
  });

  it('rejects invalid payloads with 400', async () => {
    const tenant = await createTestTenant('sup-validate');
    const res = await authed(tenant.token).post('/api/v1/suppliers').send({ name: 'Missing Fields Co' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('one company cannot see another company\'s suppliers', async () => {
    const tenantA = await createTestTenant('sup-iso-a');
    const tenantB = await createTestTenant('sup-iso-b');

    const created = await authed(tenantA.token).post('/api/v1/suppliers').send({
      name: 'Only A Can See',
      country: 'Cameroon',
      city: 'Douala',
      address: '1 A Street',
      phone: '+237600000011',
      email: 'onlya@example.com',
      type: 'COMPANY',
    });
    expect(created.status).toBe(201);

    const asB = await authed(tenantB.token).get(`/api/v1/suppliers/${created.body.data.id}`);
    expect(asB.status).toBe(404);
  });
});
