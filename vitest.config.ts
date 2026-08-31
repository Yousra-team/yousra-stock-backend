import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Generous: tests hit a real remote Supabase DB with real network latency, and the
    // goods-receipt flow alone is ~10-15 sequential round-trips (see procurement.test.ts).
    testTimeout: 40000,
    hookTimeout: 40000,
    // Integration tests drive the real Express app against one shared live database
    // (see CLAUDE_CODE_BRIEF — no test-DB isolation exists yet) — keep files sequential.
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
  },
});
