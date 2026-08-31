import 'dotenv/config';
import { afterAll } from 'vitest';
import { db } from '../src/prisma/db';

afterAll(async () => {
  await db.close();
});
