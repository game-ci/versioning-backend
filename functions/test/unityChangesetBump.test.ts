import { describe, it, expect } from 'vitest';
import { SearchMode } from 'unity-changeset';

// This test file specifically validates that the unity-changeset package bump works correctly
// by ensuring we can access the updated features, especially XLTS support

describe('unity-changeset bump validation', () => {
  it('should have access to SearchMode.XLTS after the package bump', () => {
    // Verify that XLTS mode is available in the SearchMode enum
    expect(SearchMode).toHaveProperty('XLTS');
    expect(SearchMode.XLTS).toBeDefined();

    // Verify that the other modes are still available
    expect(SearchMode).toHaveProperty('Default');
    expect(SearchMode.Default).toBeDefined();
    expect(SearchMode).toHaveProperty('PreRelease');
    expect(SearchMode.PreRelease).toBeDefined();
    expect(SearchMode).toHaveProperty('LTS');
    expect(SearchMode.LTS).toBeDefined();
    expect(SearchMode).toHaveProperty('SUPPORTED');
    expect(SearchMode.SUPPORTED).toBeDefined();
  });

  it('should have expected version of unity-changeset package', async () => {
    // Import package.json to check the version
    const packageJson = (await import('./../package.json', { assert: { type: 'json' } })).default;

    // Verify unity-changeset is in dependencies with expected version
    expect(packageJson.dependencies['unity-changeset']).toMatch(/\^3\.0\.1/);
  });

  it('should properly import and use unity-changeset functions', async () => {
    // Dynamic import to verify the module can be properly loaded after the bump
    const unityChangeset = await import('unity-changeset');

    // Verify the expected functions exist
    expect(unityChangeset.searchChangesets).toBeTypeOf('function');
    expect(unityChangeset.SearchMode).toBeDefined();
  });
});
