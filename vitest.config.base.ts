import { defineConfig, UserConfigExport } from 'vitest/config';

export const baseConfig = {
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      // thresholds: {
      //   branches: 80,
      //   functions: 80,
      //   lines: 80,
      //   statements: 80,
      // },
    },
  },
} satisfies UserConfigExport;

export default defineConfig(baseConfig);
