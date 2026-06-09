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

const stateStore: { current: any } = { current: null };
vi.mock('../src/model/reconciliationState', () => ({
  ReconciliationState: {
    load: vi.fn(async () => {
      const fallback = {
        cursorVersion: null,
        recentDispatches: {},
        baseHubCheckedAt: null,
        cycleCount: 0,
      };
      return JSON.parse(JSON.stringify(stateStore.current ?? fallback));
    }),
    save: vi.fn(async (next: any) => {
      stateStore.current = JSON.parse(JSON.stringify(next));
    }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { Discord } = await import('../src/service/discord');
const { ReconciliationState } = await import('../src/model/reconciliationState');

const repoVersionInfo = { major: 3, minor: 2, patch: 2 } as any;

const UBUNTU_PLATFORMS = [
  'base',
  'linux-il2cpp',
  'windows-mono',
  'mac-mono',
  'ios',
  'android',
  'webgl',
] as const;
const WINDOWS_PLATFORMS = [
  'base',
  'windows-il2cpp',
  'universal-windows-platform',
  'appletv',
  'android',
] as const;

const buildVersion = (version: string, changeSet = 'abc123def456') => ({
  version,
  changeSet,
  major: Number(version.split('.')[0]),
  minor: Number(version.split('.')[1]),
  patch: version.split('.')[2],
});

const tagsResponse = (tags: string[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results: tags.map((name) => ({ name })), next: null }),
});

const allPresentMock = (versionList: string[]) =>
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('unityci/base')) {
      return tagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']);
    }
    if (u.includes('unityci/hub')) {
      return tagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']);
    }
    const match = u.match(/name=(ubuntu|windows)-([^&]+)/);
    if (match) {
      const os = match[1];
      const v = decodeURIComponent(match[2]);
      if (!versionList.includes(v)) return tagsResponse([]);
      const platforms = os === 'ubuntu' ? UBUNTU_PLATFORMS : WINDOWS_PLATFORMS;
      return tagsResponse(platforms.map((p) => `${os}-${v}-${p}-3.2.2`));
    }
    return tagsResponse([]);
  });

const createDispatchEvent = vi.fn().mockResolvedValue({ status: 204 });
const gitHubClient = { repos: { createDispatchEvent } } as any;

beforeEach(() => {
  fetchMock.mockReset();
  createDispatchEvent.mockClear();
  (Discord.sendDebug as any).mockClear();
  (Discord.sendAlert as any).mockClear();
  (ReconciliationState.load as any).mockClear();
  (ReconciliationState.save as any).mockClear();
  stateStore.current = null;
});

describe('DockerImageReconciler (incremental)', () => {
  it('returns early when no versions to reconcile', async () => {
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo);
    await reconciler.reconcileEditorImages([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createDispatchEvent).not.toHaveBeenCalled();
    expect(ReconciliationState.save).not.toHaveBeenCalled();
  });

  it('reports debug when all expected tags present', async () => {
    const v = '6000.4.10f1';
    allPresentMock([v]);

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion(v)]);

    expect(createDispatchEvent).not.toHaveBeenCalled();
    expect(Discord.sendDebug).toHaveBeenCalled();
  });

  it('advances cursor and resumes from next version on subsequent cycle', async () => {
    const versions = Array.from({ length: 12 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    allPresentMock(versions.map((v) => v.version));

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_000 });
    await r1.reconcileEditorImages(versions);
    const cursor1 = stateStore.current.cursorVersion;
    expect(cursor1).toBe('6000.4.4f1');

    const r2 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 2_000_000 });
    await r2.reconcileEditorImages(versions);
    const cursor2 = stateStore.current.cursorVersion;
    expect(cursor2).toBe('6000.4.9f1');
    expect(stateStore.current.cycleCount).toBe(2);
  });

  it('honors per-tag dispatch cooldown to prevent re-dispatching', async () => {
    const v = '6000.4.10f1';
    const presentUbuntu = UBUNTU_PLATFORMS.filter((p) => p !== 'webgl').map(
      (p) => `ubuntu-${v}-${p}-3.2.2`,
    );
    const presentWindows = WINDOWS_PLATFORMS.map((p) => `windows-${v}-${p}-3.2.2`);

    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('unityci/base')) return tagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']);
      if (u.includes('unityci/hub')) return tagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']);
      if (u.includes(`name=ubuntu-${v}`)) return tagsResponse(presentUbuntu);
      if (u.includes(`name=windows-${v}`)) return tagsResponse(presentWindows);
      return tagsResponse([]);
    });

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_000 });
    await r1.reconcileEditorImages([buildVersion(v)]);
    expect(createDispatchEvent).toHaveBeenCalledTimes(1);

    createDispatchEvent.mockClear();
    const r2 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_500 });
    await r2.reconcileEditorImages([buildVersion(v)]);
    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('caps dispatches per cycle at MAX_DISPATCHES_PER_CYCLE', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
    const versions = Array.from({ length: 5 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages(versions);
    expect(createDispatchEvent.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('skips dispatch and does not crash when DockerHub returns 429', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);
    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('skips base/hub if checked recently', async () => {
    allPresentMock(['6000.4.10f1']);
    stateStore.current = {
      cursorVersion: null,
      recentDispatches: {},
      baseHubCheckedAt: 1_000_000,
      cycleCount: 1,
    };

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_500,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);

    const baseHubCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('unityci/base') || String(c[0]).includes('unityci/hub'),
    );
    expect(baseHubCalls.length).toBe(0);
  });

  it('persists cooldown timestamps in state for next cycle', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);
    expect(stateStore.current).toBeTruthy();
    expect(Object.keys(stateStore.current.recentDispatches).length).toBeGreaterThan(0);
  });

  it('wraps cursor around to beginning when reaching end of version list', async () => {
    const versions = Array.from({ length: 8 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    allPresentMock(versions.map((v) => v.version));
    stateStore.current = {
      cursorVersion: '6000.4.7f1',
      recentDispatches: {},
      baseHubCheckedAt: 999_999_999_999,
      cycleCount: 5,
    };

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 2_000_000,
    });
    await reconciler.reconcileEditorImages(versions);
    expect(stateStore.current.cursorVersion).toBe('6000.4.4f1');
  });
});
