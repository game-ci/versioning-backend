import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./functions/vitest.config.mts'],
    // Coverage is configured once at the root: Vitest ignores it in project configs.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
    },
  },
});
