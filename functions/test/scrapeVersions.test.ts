import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scrapeLatestOfficialUnityVersion,
  scrapeVersions,
  scrapeRecentOfficialUnityVersions,
} from '../src/logic/ingestUnityVersions/scrapeVersions';
import { SearchMode } from 'unity-changeset';
import fetch from 'node-fetch';

// Mock the unity-changeset module
vi.mock('unity-changeset', async () => {
  const actual = await vi.importActual('unity-changeset');
  return {
    ...actual,
    searchChangesets: vi.fn(),
  };
});

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const { searchChangesets } = await import('unity-changeset');
const mockedFetch = fetch as unknown as vi.MockedFunction<typeof fetch>;

const mockOfficialUnityRelease = (
  html = '<h1>Unity 6000.4.10f1</h1><p>Changeset: feeafc12a938</p>',
) => {
  mockedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => html,
  } as any);
};

describe('scrapeVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOfficialUnityRelease('');
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
        changeset: '234567ab8cd9',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2022.3.21f1', // XLTS versions might have same format as regular versions
        changeset: '789abcdef012',
      },
      {
        version: '2021.3.25f1',
        changeset: '345cdef67890',
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
        changeSet: '234567ab8cd9',
        major: 2023,
        minor: 2,
        patch: '10',
      }),
    );

    // Check that the XLTS versions are present
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2022.3.21f1',
        changeSet: '789abcdef012',
        major: 2022,
        minor: 3,
        patch: '21',
      }),
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        version: '2021.3.25f1',
        changeSet: '345cdef67890',
        major: 2021,
        minor: 3,
        patch: '25',
      }),
    );
  });

  it('should merge the latest official Unity release when unity-changeset is stale', async () => {
    mockOfficialUnityRelease();
    const mockDefaultVersions = [
      {
        version: '6000.4.7f1',
        changeset: 'f3c3c4248748',
      },
    ];

    (searchChangesets as vi.MockedFunction<any>).mockImplementation(async (mode: SearchMode) => {
      if (mode === SearchMode.Default) {
        return mockDefaultVersions;
      }
      return [];
    });

    const result = await scrapeVersions();

    expect(result).toContainEqual(
      expect.objectContaining({
        version: '6000.4.10f1',
        changeSet: 'feeafc12a938',
        major: 6000,
        minor: 4,
        patch: '10',
      }),
    );
  });

  it('should parse the latest official Unity release page', async () => {
    mockOfficialUnityRelease('<h1>Unity 6000.4.10f1</h1><div>Changeset: feeafc12a938</div>');

    await expect(scrapeLatestOfficialUnityVersion()).resolves.toEqual(
      expect.objectContaining({
        version: '6000.4.10f1',
        changeSet: 'feeafc12a938',
        major: 6000,
        minor: 4,
        patch: '10',
      }),
    );
  });

  it('should parse the Unity Hub install URL from the official release page', async () => {
    mockOfficialUnityRelease(
      '<h1>Unity 6000.4.10f1</h1><a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>',
    );

    await expect(scrapeLatestOfficialUnityVersion()).resolves.toEqual(
      expect.objectContaining({
        version: '6000.4.10f1',
        changeSet: 'feeafc12a938',
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
        changeset: 'abc123def456',
      },
      {
        version: '2022.3.21f1',
        changeset: '789abcdef012',
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
        changeset: '234567ab8cd9',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2021.3.25f1', // Final version - should be included
        changeset: '789abcdef012',
      },
      {
        version: '2020.3.15a2', // Alpha version - should be excluded
        changeset: '345cdef67890',
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
        changeSet: '789abcdef012',
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
        changeset: '234567ab8cd9',
      },
    ];

    const mockXltsVersions = [
      {
        version: '2021.3.25f1', // Should be included
        changeset: '789abcdef012',
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
        changeSet: '789abcdef012',
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

describe('scrapeRecentOfficialUnityVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover multiple recent versions from the releases page', async () => {
    const html = `
      <h1>Unity 6000.4.10f1</h1>
      <a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>

      <h2>Unity 6000.3.17f1</h2>
      <p>Changeset: abc123def456</p>

      <h2>Unity 6000.2.5f1</h2>
      <a href="unityhub://6000.2.5f1/deadbeef0123">Download</a>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    expect(result).toHaveLength(3);
    expect(result.map((v) => v.version)).toContain('6000.4.10f1');
    expect(result.map((v) => v.version)).toContain('6000.3.17f1');
    expect(result.map((v) => v.version)).toContain('6000.2.5f1');
  });

  it('should extract changesets from unityhub:// URLs', async () => {
    const html = `
      <a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>
      <a href="unityhub://6000.3.17f1/abc123def456">Install</a>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    expect(result).toContainEqual(
      expect.objectContaining({
        version: '6000.4.10f1',
        changeSet: 'feeafc12a938',
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        version: '6000.3.17f1',
        changeSet: 'abc123def456',
      }),
    );
  });

  it('should extract changesets from context near the version', async () => {
    const html = `
      <h2>Unity 6000.4.10f1</h2>
      <p>Changeset: feeafc12a938</p>

      <h2>Unity 6000.3.17f1</h2>
      <p>Changeset: abc123def456 is the commit hash</p>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    // Both should be found - implementation uses context-window search
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((v) => v.version === '6000.4.10f1')).toBe(true);
    expect(result.some((v) => v.version === '6000.3.17f1')).toBe(true);
  });

  it('should skip versions without valid changesets nearby', async () => {
    const html = `
      <h2>Unity 6000.4.10f1</h2>
      <a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>

      <h2>Unity 6000.2.5f1</h2>
      <p>This version has no changeset information</p>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    // Only 6000.4.10f1 should be found with a valid changeset
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map((v) => v.version)).toContain('6000.4.10f1');
    expect(result.map((v) => v.version)).not.toContain('6000.2.5f1');
  });

  it('should deduplicate versions found multiple times on the page', async () => {
    const html = `
      <h2>Unity 6000.4.10f1</h2>
      <a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>

      <p>Latest version: 6000.4.10f1</p>
      <a href="unityhub://6000.4.10f1/feeafc12a938">Download</a>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    expect(result).toHaveLength(1);
    expect(result[0].version).toBe('6000.4.10f1');
  });

  it('should return empty array if page returns error', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 404,
    } as any);

    await expect(scrapeRecentOfficialUnityVersions()).rejects.toThrow(
      'Unity release page returned 404',
    );
  });

  it('should filter out non-final versions', async () => {
    const html = `
      <h2>Unity 6000.4.10f1</h2>
      <a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>

      <h2>Unity 6000.4.10a1</h2>
      <a href="unityhub://6000.4.10a1/abc1234567ab">Install</a>

      <h2>Unity 6000.4.9f1</h2>
      <a href="unityhub://6000.4.9f1/def1234567cd">Install</a>
    `;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as any);

    const result = await scrapeRecentOfficialUnityVersions();

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.map((v) => v.version)).toContain('6000.4.10f1');
    expect(result.map((v) => v.version)).toContain('6000.4.9f1');
    expect(result.map((v) => v.version)).not.toContain('6000.4.10a1');
  });
});
