import { describe, expect, it } from 'vitest';
import { api, authed, createTestTenant, uniqueEmail } from './helpers';

describe('auth', () => {
  it('POST /companies creates a company + admin user and returns a usable token', async () => {
    const tenant = await createTestTenant('bootstrap');
    expect(tenant.token).toBeTruthy();
    expect(tenant.companyId).toBeTruthy();

    const me = await authed(tenant.token).get('/api/v1/companies/' + tenant.companyId);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(tenant.companyId);
  });

  it('never returns passwordHash on the bootstrap response', async () => {
    const res = await api.post('/api/v1/companies').send({
      name: 'No Leak Co',
      email: uniqueEmail('noleak-co'),
      phone: '+237600000000',
      address: '1 Test Street',
      city: 'Douala',
      country: 'Cameroon',
      owner: {
        firstName: 'No',
        lastName: 'Leak',
        email: uniqueEmail('noleak-owner'),
        phone: '+237600000001',
        password: 'password123',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('POST /auth/login succeeds with correct credentials and fails with wrong password', async () => {
    const email = uniqueEmail('login-owner');
    const password = 'correct-horse-battery';

    await api.post('/api/v1/companies').send({
      name: 'Login Co',
      email: uniqueEmail('login-co'),
      phone: '+237600000000',
      address: '1 Test Street',
      city: 'Douala',
      country: 'Cameroon',
      owner: { firstName: 'Log', lastName: 'In', email, phone: '+237600000001', password },
    });

    const ok = await api.post('/api/v1/auth/login').send({ email, password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();

    const bad = await api.post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('rejects protected routes without a token, and with a garbage token', async () => {
    const noToken = await api.get('/api/v1/suppliers');
    expect(noToken.status).toBe(401);

    const badToken = await api.get('/api/v1/suppliers').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('POST /auth/user (protected) adds a teammate to the caller\'s own company', async () => {
    const tenant = await createTestTenant('teammate');
    const res = await authed(tenant.token).post('/api/v1/auth/user').send({
      firstName: 'Team',
      lastName: 'Mate',
      email: uniqueEmail('teammate-user'),
      phone: '+237600000002',
      role: 'Staff',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.companyId).toBe(tenant.companyId);
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('a company cannot read another company\'s record (tenant isolation)', async () => {
    const tenantA = await createTestTenant('iso-a');
    const tenantB = await createTestTenant('iso-b');

    const res = await authed(tenantA.token).get('/api/v1/companies/' + tenantB.companyId);
    expect(res.status).toBe(403);
  });

  it('a non-Admin cannot add a teammate, and cannot self-escalate by requesting role: Admin', async () => {
    const tenant = await createTestTenant('no-escalate');
    const client = authed(tenant.token);

    const staff = await client.post('/api/v1/auth/user').send({
      firstName: 'Staff',
      lastName: 'Member',
      email: uniqueEmail('staff-member'),
      phone: '+237600000003',
      role: 'Staff',
      password: 'password123',
    });
    expect(staff.status).toBe(201);

    const staffLogin = await api
      .post('/api/v1/auth/login')
      .send({ email: staff.body.data.email, password: 'password123' });
    expect(staffLogin.status).toBe(200);

    const escalate = await authed(staffLogin.body.data.token).post('/api/v1/auth/user').send({
      firstName: 'Sneaky',
      lastName: 'Admin',
      email: uniqueEmail('sneaky-admin'),
      phone: '+237600000004',
      role: 'Admin',
      password: 'password123',
    });
    expect(escalate.status).toBe(403);
  });
});
