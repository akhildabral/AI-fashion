import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // src/config/env.ts validates process.env on import and exits when a
    // required key is missing. Tests never open a database connection or call
    // a provider, so placeholders are enough; a real .env or CI variable of
    // the same name still wins.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-only-jwt-secret-not-used-anywhere',
      AI_PROVIDER: process.env.AI_PROVIDER ?? 'openai',
      AI_API_KEY: process.env.AI_API_KEY ?? 'test-only-key',
    },
  },
});
