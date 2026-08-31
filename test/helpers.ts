import request from 'supertest';
import { app } from '../src/app';

export const api = request(app);

/** Collision-safe email for tests — timestamp + random suffix, since `User.email` is only unique per company. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.yousra.local`;
}

export interface TestTenant {
  token: string;
  companyId: string;
  userId: string;
}

/** Bootstraps a fresh company + admin user via `POST /companies` and returns a ready-to-use bearer token. */
export async function createTestTenant(prefix = 'tenant'): Promise<TestTenant> {
  const res = await api.post('/api/v1/companies').send({
    name: `Test Co ${prefix} ${Date.now()}`,
    email: uniqueEmail(`${prefix}-company`),
    phone: '+237600000000',
    address: '1 Test Street',
    city: 'Douala',
    country: 'Cameroon',
    owner: {
      firstName: 'Test',
      lastName: 'Owner',
      email: uniqueEmail(`${prefix}-owner`),
      phone: '+237600000001',
      password: 'password123',
    },
  });

  if (res.status !== 201) {
    throw new Error(`Failed to bootstrap test tenant: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.token as string,
    companyId: res.body.data.company.id as string,
    userId: res.body.data.user.employeeId as string,
  };
}

/** A supertest wrapper that attaches the bearer token to every call. */
export function authed(token: string) {
  return {
    get: (url: string) => api.get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => api.post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => api.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => api.delete(url).set('Authorization', `Bearer ${token}`),
  };
}
