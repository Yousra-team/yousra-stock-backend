import { describe, expect, it } from 'vitest';
import { authed, createTestTenant } from './helpers';

describe('integration (external systems)', () => {
  it('issues a plaintext token on create, rotates it, then revokes', async () => {
    const tenant = await createTestTenant('integration');
    const client = authed(tenant.token);

    const created = await client.post('/api/v1/integration/systems').send({
      name: 'Pizzaland V2',
      description: 'Server-to-server integration',
      phone: '+237600000030',
    });
    expect(created.status).toBe(201);
    expect(typeof created.body.data.apiToken).toBe('string');
    expect(created.body.data.system.apiToken).toBeUndefined();
    const systemId = created.body.data.system.id;

    const list = await client.get('/api/v1/integration/systems');
    expect(list.status).toBe(200);
    expect(list.body.data.some((s: { id: string }) => s.id === systemId)).toBe(true);
    expect(list.body.data.every((s: { apiToken?: unknown }) => s.apiToken === undefined)).toBe(true);

    const rotated = await client.post(`/api/v1/integration/systems/${systemId}/rotate-keys`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.apiToken).not.toBe(created.body.data.apiToken);

    const revoked = await client.delete(`/api/v1/integration/systems/${systemId}`);
    expect(revoked.status).toBe(204);

    const listAfterRevoke = await client.get('/api/v1/integration/systems');
    expect(listAfterRevoke.body.data.some((s: { id: string }) => s.id === systemId)).toBe(false);
  });
});
