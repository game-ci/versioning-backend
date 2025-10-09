import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./functions/vitest.config.ts'],
  },
});
