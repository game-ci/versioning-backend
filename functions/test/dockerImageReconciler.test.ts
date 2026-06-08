import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scrapeLatestOfficialUnityVersion,
  scrapeVersions,
} from '../src/logic/ingestUnityVersions/scrapeVersions';
import { SearchMode } from 'unity-changeset';

vi.mock('unity-changeset', async () => {
  return {
    searchChangesets: vi.fn(),
    SearchMode,
  };
});

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const { searchChangesets } = await import('unity-changeset');
const fetch = (await import('node-fetch')).default as any;

const mockOfficialUnityRelease = (
  html = '<h1>Unity 6000.4.10f1</h1><p>Changeset: feeafc12a938</p>',
) => {
  (fetch as any).mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => html,
  });
};

describe('scrapeVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOfficialUnityRelease();
  });

  it('should fetch both default and XLTS versions', async () => {
    const mockVersions = [
      { version: '2022.3.15f1', changeset: 'abc123def456' },
    ];

    (searchChangesets as any).mockImplementation(async (mode: SearchMode) => {
      if (mode === SearchMode.Default) return mockVersions;
      return [];
    });

    const result = await scrapeVersions();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          version: '2022.3.15f1',
          changeSet: 'abc123def456',
          major: 2022,
          minor: 3,
          patch: '15',
        }),
      ]),
    );
  });

  it('should merge latest official Unity release when stale', async () => {
    mockOfficialUnityRelease();
    const mockDefaultVersions = [
      { version: '6000.4.7f1', changeset: 'f3c3c4248748' },
    ];

    (searchChangesets as any).mockImplementation(async (mode: SearchMode) => {
      if (mode === SearchMode.Default) return mockDefaultVersions;
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

  it('should parse latest official release page', async () => {
    mockOfficialUnityRelease(
      '<h1>Unity 6000.4.10f1</h1>' +
        '<a href="unityhub://6000.4.10f1/feeafc12a938">Install</a>',
    );

    const result = await scrapeLatestOfficialUnityVersion();

    expect(result).toEqual(
      expect.objectContaining({
        version: '6000.4.10f1',
        changeSet: 'feeafc12a938',
        major: 6000,
        minor: 4,
        patch: '10',
      }),
    );
  });
});
