import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerImageReconciler } from '../src/logic/buildQueue/dockerImageReconciler';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/service/discord', () => ({
  Discord: {
    sendDebug: vi.fn().mockResolvedValue(undefined),
    sendAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { Discord } = await import('../src/service/discord');

const repoVersionInfo = { major: 3, minor: 2, patch: 2 } as any;

const buildVersion = (version: string, changeSet = 'abc123def456') => ({
  version,
  changeSet,
  major: Number(version.split('.')[0]),
  minor: Number(version.split('.')[1]),
  patch: version.split('.')[2],
});

const mockTagsResponse = (tags: string[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results: tags.map((name) => ({ name })), next: null }),
});

const emptyTagsResponse = () => mockTagsResponse([]);

const createDispatchEvent = vi.fn().mockResolvedValue({ status: 204 });
const gitHubClient = { repos: { createDispatchEvent } } as any;

beforeEach(() => {
  fetchMock.mockReset();
  createDispatchEvent.mockClear();
  (Discord.sendDebug as any).mockClear();
  (Discord.sendAlert as any).mockClear();
});

describe('DockerImageReconciler', () => {
  it('returns early when no versions to reconcile', async () => {
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('reports success when all expected tags exist on DockerHub', async () => {
    const editorVersion = '6000.4.10f1';
    const ubuntuPlatforms = [
      'base',
      'linux-il2cpp',
      'windows-mono',
      'mac-mono',
      'ios',
      'android',
      'webgl',
    ];
    const windowsPlatforms = [
      'base',
      'windows-il2cpp',
      'universal-windows-platform',
      'appletv',
      'android',
    ];
    const editorTags = [
      ...ubuntuPlatforms.map((p) => `ubuntu-${editorVersion}-${p}-3.2.2`),
      ...windowsPlatforms.map((p) => `windows-${editorVersion}-${p}-3.2.2`),
    ];

    fetchMock
      .mockResolvedValueOnce(mockTagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']))
      .mockResolvedValueOnce(mockTagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']))
      .mockResolvedValueOnce(mockTagsResponse(editorTags));

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([buildVersion(editorVersion)]);

    expect(createDispatchEvent).not.toHaveBeenCalled();
    expect(Discord.sendDebug).toHaveBeenCalled();
    expect(Discord.sendAlert).not.toHaveBeenCalled();
  });

  it('dispatches retries for missing editor tags across ALL versions, not just recent ones', async () => {
    const oldVersion = '6000.3.17f1';
    const newVersion = '6000.4.10f1';

    fetchMock
      .mockResolvedValueOnce(mockTagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']))
      .mockResolvedValueOnce(mockTagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']))
      .mockResolvedValueOnce(
        mockTagsResponse([`ubuntu-${newVersion}-base-3.2.2`, `ubuntu-${newVersion}-webgl-3.2.2`]),
      );

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([buildVersion(newVersion), buildVersion(oldVersion)]);

    const dispatchedTags = createDispatchEvent.mock.calls.map(
      (call) => (call[0] as any).client_payload,
    );

    const oldVersionDispatches = dispatchedTags.filter((p) => p.editorVersion === oldVersion);
    expect(oldVersionDispatches.length).toBeGreaterThan(0);
    expect(Discord.sendAlert).toHaveBeenCalled();
  });

  it('handles DockerHub tag list API failure without crashing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);

    // When tags can't be fetched, every expected image looks "missing" - retries should still be capped.
    expect(createDispatchEvent.mock.calls.length).toBeLessThanOrEqual(30);
  });

  it('paginates through multiple pages of DockerHub tags', async () => {
    const editorVersion = '6000.4.10f1';
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ name: 'ubuntu-3.2.2' }],
          next: 'https://hub.docker.com/v2/repositories/unityci/base/tags?page=2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ name: 'windows-3.2.2' }], next: null }),
      })
      .mockResolvedValue(emptyTagsResponse());

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([buildVersion(editorVersion)]);

    const baseRequests = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('unityci/base'),
    );
    expect(baseRequests.length).toBeGreaterThanOrEqual(2);
  });

  it('caps dispatched retries per cycle to prevent API overload', async () => {
    fetchMock.mockResolvedValue(emptyTagsResponse());

    const manyVersions = Array.from({ length: 10 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages(manyVersions);

    expect(createDispatchEvent.mock.calls.length).toBeLessThanOrEqual(30);
  });
});
