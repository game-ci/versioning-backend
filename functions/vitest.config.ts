import { defineProject } from 'vitest/config';
import { baseConfig } from '../vitest.config.base';

export default defineProject({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: ['node_modules', 'dist', '.idea', '.git', 'coverage'],
    globals: true,
    environment: 'node',
  },
});
