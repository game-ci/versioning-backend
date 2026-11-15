import { defineConfig, UserConfigExport } from 'vitest/config';

export const baseConfig = {
  test: {},
} satisfies UserConfigExport;

export default defineConfig(baseConfig);
