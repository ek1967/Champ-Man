import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Several tests simulate hundreds of matches or whole seasons.
    testTimeout: 60_000,
  },
});
