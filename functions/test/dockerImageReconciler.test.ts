import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerImageReconciler } from '../src/logic/buildQueue/dockerImageReconciler';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/service/firebase', () => ({
  db: {},
  admin: { firestore: { FieldValue: {}, DocumentSnapshot: {}, Timestamp: { now: () => 'now' } } },
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
        versionHistory: {},
        recentDispatches: {},
        baseHubCheckedAt: null,
        cycleCount: 0,
      };
      return JSON.parse(JSON.stringify(stateStore.current ?? fallback));
    }),
    save: vi.fn(async (next: any) => {
      stateStore.current = JSON.parse(JSON.stringify(next));
    }),
    getOrCreateVersionRecord: vi.fn((state: any, version: string) => {
      if (!state.versionHistory[version]) {
        state.versionHistory[version] = {
          lastCheckedAt: null,
          lastDispatchAttemptAt: null,
          dispatchFailureCount: 0,
          imagesExpected: 0,
          imagesMissing: 0,
        };
      }
      return state.versionHistory[version];
    }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { Discord } = await import('../src/service/discord');
const { ReconciliationState } = await import('../src/model/reconciliationState');

const repoVersionInfo = { version: '3.2.2', major: 3, minor: 2, patch: 2 } as any;

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

describe('DockerImageReconciler (priority-based)', () => {
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

  it('prioritizes recent versions in first cycle', async () => {
    const versions = Array.from({ length: 20 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    allPresentMock(versions.map((v) => v.version));

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_000 });
    await r1.reconcileEditorImages(versions);

    const history = stateStore.current.versionHistory;
    const checked = Object.keys(history).filter((v) => history[v].lastCheckedAt !== null);
    expect(checked.length).toBe(5);

    const recentVersions = checked.every((v) => {
      const vNum = parseInt(v.split('.')[2]);
      return vNum < 15;
    });
    expect(recentVersions).toBe(true);
  });

  it('continues checking versions across cycles', async () => {
    const versions = Array.from({ length: 20 }, (_, i) => buildVersion(`6000.4.${i}f1`));
    allPresentMock(versions.map((v) => v.version));

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_000 });
    await r1.reconcileEditorImages(versions);
    let history = stateStore.current.versionHistory;
    const cycle1Checked = Object.keys(history).filter((v) => history[v].lastCheckedAt !== null);
    expect(cycle1Checked.length).toBe(5);
    expect(stateStore.current.cycleCount).toBe(1);

    const r2 = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000 + 5 * 24 * 60 * 60 * 1000,
    });
    await r2.reconcileEditorImages(versions);
    history = stateStore.current.versionHistory;

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
      versionHistory: {},
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

  it('tracks version history with missing image counts', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));
    const versions = Array.from({ length: 10 }, (_, i) => buildVersion(`6000.4.${i}f1`));

    const r1 = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => 1_000_000 });
    await r1.reconcileEditorImages(versions);

    const history = stateStore.current.versionHistory;
    const checkedVersions = Object.keys(history).filter((v) => history[v].lastCheckedAt !== null);
    expect(checkedVersions.length).toBeGreaterThan(0);
    expect(history['6000.4.0f1']?.imagesMissing).toBeGreaterThan(0);
  });
});

describe('DockerImageReconciler (correctness)', () => {
  const missingEverythingMock = (nextPage: string | null) =>
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('unityci/base') || u.includes('unityci/hub')) {
        return tagsResponse(['ubuntu-3.2.2', 'windows-3.2.2']);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ name: 'unrelated-tag' }], next: nextPage }),
      };
    });

  it('treats a tag list cut off by the page limit as unknown, not missing', async () => {
    missingEverythingMock('https://hub.docker.com/v2/repositories/unityci/editor/tags?page=next');

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);

    expect(createDispatchEvent).not.toHaveBeenCalled();
  });

  it('dispatches rebuilds under the existing CI job of that editor version', async () => {
    missingEverythingMock(null);

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.10f1')]);

    expect(createDispatchEvent).toHaveBeenCalled();
    const jobIds = new Set(
      createDispatchEvent.mock.calls.map(([request]) => request.client_payload.jobId),
    );
    expect([...jobIds]).toEqual(['editor-6000.4.10f1-3.2.2']);
  });

  it('eventually checks every version, not only the most recent ones', async () => {
    const versions = Array.from({ length: 20 }, (_, i) => buildVersion(`6000.4.${19 - i}f1`));
    allPresentMock(versions.map((v) => v.version));

    const day = 24 * 60 * 60 * 1000;
    for (let cycle = 0; cycle < 8; cycle += 1) {
      const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
        now: () => 1_000_000 + cycle * day,
      });
      await reconciler.reconcileEditorImages(versions);
    }

    const history = stateStore.current.versionHistory;
    const neverChecked = versions
      .map((v) => v.version)
      .filter((v) => !history[v] || history[v].lastCheckedAt === null);
    expect(neverChecked).toEqual([]);
  });
});

const versionRecord = (overrides: Record<string, unknown>) => ({
  lastCheckedAt: null,
  lastDispatchAttemptAt: null,
  dispatchFailureCount: 0,
  imagesExpected: 12,
  imagesMissing: 0,
  ...overrides,
});

describe('DockerImageReconciler (failure history and unknown tags)', () => {
  const day = 24 * 60 * 60 * 1000;

  it('checks a newly released version ahead of versions with a long dispatch failure history', async () => {
    const now = 100 * day;
    const failing = Array.from({ length: 5 }, (_, i) => buildVersion(`6000.4.${i + 1}f1`));
    const released = buildVersion('6000.4.99f1');
    stateStore.current = {
      versionHistory: Object.fromEntries(
        failing.map((v) => [
          v.version,
          versionRecord({
            lastCheckedAt: now - day,
            lastDispatchAttemptAt: now - day,
            dispatchFailureCount: 10,
            imagesMissing: 1,
          }),
        ]),
      ),
      recentDispatches: {},
      baseHubCheckedAt: now,
      cycleCount: 1,
    };
    allPresentMock([...failing, released].map((v) => v.version));

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => now });
    await reconciler.reconcileEditorImages([...failing, released]);

    expect(stateStore.current.versionHistory[released.version]?.lastCheckedAt).toBe(now);
  });

  it('clears the dispatch failure count once a dispatch succeeds', async () => {
    const now = 100 * day;
    const version = buildVersion('6000.4.1f1');
    stateStore.current = {
      versionHistory: {
        [version.version]: versionRecord({ dispatchFailureCount: 4, imagesMissing: 1 }),
      },
      recentDispatches: {},
      baseHubCheckedAt: now,
      cycleCount: 1,
    };
    fetchMock.mockResolvedValue(tagsResponse([]));

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => now });
    await reconciler.reconcileEditorImages([version]);

    expect(createDispatchEvent).toHaveBeenCalled();
    expect(stateStore.current.versionHistory[version.version].dispatchFailureCount).toBe(0);
  });

  it('leaves a version unchecked while its tag list is unknown', async () => {
    const now = 100 * day;
    const version = buildVersion('6000.4.1f1');
    const previous = versionRecord({ lastCheckedAt: now - 3 * day, imagesMissing: 2 });
    stateStore.current = {
      versionHistory: { [version.version]: previous },
      recentDispatches: {},
      baseHubCheckedAt: now,
      cycleCount: 1,
    };
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, { now: () => now });
    await reconciler.reconcileEditorImages([version]);

    const record = stateStore.current.versionHistory[version.version];
    expect(record.lastCheckedAt).toBe(previous.lastCheckedAt);
    expect(record.imagesMissing).toBe(2);
    expect(record.imagesUnknown).toBe(12);
  });

  it('reports images whose tags could not be listed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.1f1')]);

    const messages = [
      ...(Discord.sendDebug as any).mock.calls,
      ...(Discord.sendAlert as any).mock.calls,
    ].map(([message]) => message);
    expect(messages.join('\n')).toMatch(/16 unknown/);
  });

  it('marks rebuild dispatches as reconciliation', async () => {
    fetchMock.mockResolvedValue(tagsResponse([]));

    const reconciler = new DockerImageReconciler(gitHubClient, repoVersionInfo, {
      now: () => 1_000_000,
    });
    await reconciler.reconcileEditorImages([buildVersion('6000.4.1f1')]);

    expect(createDispatchEvent).toHaveBeenCalled();
    for (const [request] of createDispatchEvent.mock.calls) {
      expect(request.client_payload.reconciliation).toBe(true);
    }
  });
});
