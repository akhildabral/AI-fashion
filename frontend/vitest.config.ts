import { defineConfig } from 'vitest/config'

// Unit tests for the browser-side session logic run in plain Node: the
// tests stub `localStorage`, `sessionStorage` and `fetch` themselves.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
