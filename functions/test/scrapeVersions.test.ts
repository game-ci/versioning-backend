import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeVersions } from '../src/logic/ingestUnityVersions/scrapeVersions';
import { SearchMode } from 'unity-changeset';

// Mock the unity-changeset module
vi.mock('unity-changeset', async () => {
  const actual = await vi.importActual('unity-changeset');
  return {
    ...actual,
    searchChangesets: vi.fn(),
  };
});

const { searchChangesets } = await import('unity-changeset');

describe('scrapeVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch both default and XLTS versions', async () => {
    // Mock return values for both Default and XLTS search modes
    const mockDefaultVersions = [
      {
        version: '2022.3.20f1',
        changeset: 'abc123def456',
      },
      {
        version: '2023.2.10f1',
        changeset: 'def456ghi789',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2022.3.21f1', // XLTS versions might have same format as regular versions
        changeset: 'xyz789uvw123',
      },
      {
        version: '2021.3.25f1',
        changeset: 'uvw123rst456',
      },
    ];

    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (mode: SearchMode) => {
      if (mode === SearchMode.Default) {
        return mockDefaultVersions;
      } else if (mode === SearchMode.XLTS) {
        return mockXltsVersions;
      }
      return [];
    });

    const result = await scrapeVersions();

    // Verify that both Default and XLTS methods were called
    expect(searchChangesets).toHaveBeenCalledWith(SearchMode.Default);
    expect(searchChangesets).toHaveBeenCalledWith(SearchMode.XLTS);

    // Verify the result includes both default and XLTS versions
    expect(result).toHaveLength(4); // 2 default + 2 XLTS (assuming no overlap)

    // Check that the default versions are present
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2022.3.20f1',
        changeSet: 'abc123def456',
        major: 2022,
        minor: 3,
        patch: '20',
      }),
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2023.2.10f1',
        changeSet: 'def456ghi789',
        major: 2023,
        minor: 2,
        patch: '10',
      }),
    );

    // Check that the XLTS versions are present
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2022.3.21f1',
        changeSet: 'xyz789uvw123',
        major: 2022,
        minor: 3,
        patch: '21',
      }),
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2021.3.25f1',
        changeSet: 'uvw123rst456',
        major: 2021,
        minor: 3,
        patch: '25',
      }),
    );
  });

  it('should not duplicate versions when XLTS versions overlap with default versions', async () => {
    // Mock return values where one XLTS version is the same as a default version
    const mockDefaultVersions = [
      {
        version: '2022.3.20f1',
        changeset: 'abc123def456',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2022.3.20f1', // Duplicate version
        changeset: 'duplicate456',
      },
      {
        version: '2022.3.21f1',
        changeset: 'xyz789uvw123',
      },
    ];

    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (_mode: SearchMode) => {
      if (_mode === SearchMode.Default) {
        return mockDefaultVersions;
      } else if (_mode === SearchMode.XLTS) {
        return mockXltsVersions;
      }
      return [];
    });

    const result = await scrapeVersions();

    // Verify that duplicate was filtered out
    expect(result).toHaveLength(2); // Only 2 unique versions
    expect(result.some((v) => v.version === '2022.3.20f1')).toBe(true);
    expect(result.some((v) => v.version === '2022.3.21f1')).toBe(true);
  });

  it('should filter out non-final versions (not containing "f")', async () => {
    const mockDefaultVersions = [
      {
        version: '2022.3.20f1', // Final version - should be included
        changeset: 'abc123def456',
      },
      {
        version: '2022.3.20a1', // Alpha version - should be excluded
        changeset: 'def456ghi789',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2021.3.25f1', // Final version - should be included
        changeset: 'xyz789uvw123',
      },
      {
        version: '2020.3.15a2', // Alpha version - should be excluded
        changeset: 'uvw123rst456',
      },
    ];

    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (_mode: SearchMode) => {
      if (_mode === SearchMode.Default) {
        return mockDefaultVersions;
      } else if (_mode === SearchMode.XLTS) {
        return mockXltsVersions;
      }
      return [];
    });

    const result = await scrapeVersions();

    // Should only contain the final versions
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2022.3.20f1',
        changeSet: 'abc123def456',
        major: 2022,
        minor: 3,
        patch: '20',
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2021.3.25f1',
        changeSet: 'xyz789uvw123',
        major: 2021,
        minor: 3,
        patch: '25',
      }),
    );
    // Alpha versions should be excluded
    expect(result.some((v) => v.version.includes('a1'))).toBe(false);
    expect(result.some((v) => v.version.includes('a2'))).toBe(false);
  });

  it('should filter out versions with major number less than 2017', async () => {
    const mockDefaultVersions = [
      {
        version: '2022.3.20f1', // Should be included
        changeset: 'abc123def456',
      },
      {
        version: '5.6.7f1', // Should be excluded (major < 2017)
        changeset: 'def456ghi789',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2021.3.25f1', // Should be included
        changeset: 'xyz789uvw123',
      },
    ];

    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (mode: SearchMode) => {
      if (mode === SearchMode.Default) {
        return mockDefaultVersions;
      } else if (mode === SearchMode.XLTS) {
        return mockXltsVersions;
      }
      return [];
    });

    const result = await scrapeVersions();

    // Should only contain versions with major >= 2017
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2022.3.20f1',
        changeSet: 'abc123def456',
        major: 2022,
        minor: 3,
        patch: '20',
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2021.3.25f1',
        changeSet: 'xyz789uvw123',
        major: 2021,
        minor: 3,
        patch: '25',
      }),
    );
    // Old version should be excluded
    expect(result.some((v) => v.major < 2017)).toBe(false);
  });

  it('should throw an error when no Unity versions are found', async () => {
    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (_mode: SearchMode) => {
      return [];
    });

    await expect(scrapeVersions()).rejects.toThrow('No Unity versions found!');
  });
});
