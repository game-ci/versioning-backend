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
      return (
        stateStore.current ?? {
          cursorVersion: null,
          recentDispatches: {},
          baseHubCheckedAt: null,
          cycleCount: 0,
        }
      );
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

const createDispatchEvent = vi.fn().mockResolvedValue({ status: 204 });
const gitHubClient = { repos: { createDispatchEvent } } as any;

const advancingClock = (start: number) => {
  let t = start;
  return () => {
    t += 1;
    return t;
  };
};

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
    const ubuntuTags = [
      'base',
      'linux-il2cpp',
      'windows-mono',
      'mac-mono',
      'ios',
      'android',
      'webgl',
    ].map((p) => `ubuntu-${v}-${p}-3.2.2`);
    const windowsTags = [
      'base',
      'windows-il2cpp',
      'universal-windows-platform',
      'appletv',
      'android',
    ].map((p) => `windows-${v}-${p}-3.2.2`);

    fetchMock
      .mockResolvedValueOnce(tagsResponse([`ubuntu-${3.22}`, `ubuntu-3.2.2`]))
      .mockResolvedValueOnce(tagsResponse([`windows-3.2.2`]))
      .mockResolvedValueOnce(tagsResponse([`ubuntu-3.2.2`]))
      .mockResolvedValueOnce(tagsResponse([`windows-3.2.2`]))
      .mockResolvedValueOnce(tagsResponse(ubuntuTags))
      .mockResolvedValueOnce(tagsResponse(windowsTags));

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(1_000_000),
    });
    await reconciler.reconcileEditorImages([buildVersion(v)]);

    expect(createDispatchEvent).not.toHaveBeenCalled();
    expect(Discord.sendDebug).toHaveBeenCalled();
  });

  it('advances cursor and resumes from next version on subsequent cycle', async () => {
    const versions = Array.from({ length: 8 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    fetchMock.mockResolvedValue(tagsResponse([]));

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(1_000_000),
    });
    await r1.reconcileEditorImages(versions);
    const stateAfterCycle1 = stateStore.current;
    expect(stateAfterCycle1.cursorVersion).toBeTruthy();

    const r2 = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(2_000_000),
    });
    await r2.reconcileEditorImages(versions);
    const stateAfterCycle2 = stateStore.current;
    expect(stateAfterCycle2.cursorVersion).not.toBe(stateAfterCycle1.cursorVersion);
    expect(stateAfterCycle2.cycleCount).toBe(2);
  });

  it('honors per-tag dispatch cooldown to prevent re-dispatching', async () => {
    const v = '6000.3.17f1';
    fetchMock.mockResolvedValue(tagsResponse([]));

    let t = 1_000_000;
    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => {
        t += 1;
        return t;
      },
    });
    await r1.reconcileEditorImages([buildVersion(v)]);
    const dispatchedFirst = createDispatchEvent.mock.calls.length;
    expect(dispatchedFirst).toBeGreaterThan(0);

    createDispatchEvent.mockClear();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(tagsResponse([]));
    const r2 = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => {
        t += 1;
        return t;
      },
    });
    await r2.reconcileEditorImages([buildVersion(v)]);
    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('caps dispatches per cycle at MAX_DISPATCHES_PER_CYCLE', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
    const versions = Array.from({ length: 5 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(1_000_000),
    });
    await reconciler.reconcileEditorImages(versions);
    expect(createDispatchEvent.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('skips dispatch and does not crash when DockerHub returns 429', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(1_000_000),
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);
    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('skips base/hub if checked recently', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
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
      now: advancingClock(1_000_000),
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);
    expect(stateStore.current).toBeTruthy();
    expect(Object.keys(stateStore.current.recentDispatches).length).toBeGreaterThan(0);
  });

  it('wraps cursor around to beginning when reaching end of version list', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
    const versions = [
      buildVersion('6000.4.10f1'),
      buildVersion('6000.3.17f1'),
      buildVersion('6000.2.5f1'),
    ];
    stateStore.current = {
      cursorVersion: '6000.2.5f1',
      recentDispatches: {},
      baseHubCheckedAt: Date.now(),
      cycleCount: 5,
    };

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: advancingClock(2_000_000),
    });
    await reconciler.reconcileEditorImages(versions);
    expect(stateStore.current.cursorVersion).not.toBe('6000.2.5f1');
  });
});
