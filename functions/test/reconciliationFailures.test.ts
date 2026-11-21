import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/service/firebase', async () => {
  const { createInMemoryFirestore } = await import('./support/inMemoryFirestore');
  return createInMemoryFirestore();
});

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_options: unknown, handler: unknown) => handler,
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'internal-token' }),
}));

vi.mock('../src/service/discord', () => ({
  Discord: {
    init: vi.fn(),
    sendDebug: vi.fn(),
    sendAlert: vi.fn(),
    sendNews: vi.fn(),
  },
}));

vi.mock('../src/service/github', () => ({ GitHub: { init: vi.fn() } }));

vi.mock('../src/service/dockerhub', () => ({
  Dockerhub: {
    fetchImageData: vi.fn(async () => null),
    getImageName: vi.fn(() => 'editor'),
    getRepositoryBaseName: vi.fn(() => 'unityci'),
  },
}));

// Every failing job has builds to retry, so retries claim every open slot.
vi.mock('../src/logic/buildQueue/ingeminator', () => ({
  Ingeminator: class {
    constructor(private readonly numberToSchedule: number) {}

    async rescheduleFailedJobs() {
      return this.numberToSchedule;
    }
  },
}));

const firestore = (await import('../src/service/firebase')) as any;
const { reportNewBuild } = await import('../src/api/reportNewBuild');
const { reportBuildFailure } = await import('../src/api/reportBuildFailure');
const { Scheduler } = await import('../src/logic/buildQueue/scheduler');
const { Cleaner } = await import('../src/logic/buildQueue/cleaner');
const { ActiveDockerRuns } = await import('../src/logic/buildQueue/activeDockerRuns');
const { FakeTimestamp } = await import('./support/inMemoryFirestore');

const repoVersionInfo = { version: '3.2.2', major: 3, minor: 2, patch: 2 } as any;
const editorVersions = ['6000.0.1f1', '6000.0.2f1', '6000.0.3f1'];
const jobIdFor = (editorVersion: string) => `editor-${editorVersion}-3.2.2`;
const buildIdFor = (editorVersion: string) => `editor-ubuntu-${editorVersion}-webgl-3.2.2`;

const call = async (handler: any, body: Record<string, unknown>) => {
  const response = { code: 0, status: vi.fn(), send: vi.fn() };
  response.status.mockImplementation((code: number) => {
    response.code = code;
    return response;
  });
  await handler({ header: () => 'Bearer internal-token', headers: {}, body }, response);
  return response.code;
};

const startBuild = (editorVersion: string, extra: Record<string, unknown> = {}) =>
  call(reportNewBuild, {
    jobId: jobIdFor(editorVersion),
    buildId: buildIdFor(editorVersion),
    imageType: 'editor',
    baseOs: 'ubuntu',
    repoVersion: '3.2.2',
    editorVersion,
    targetPlatform: 'webgl',
    ...extra,
  });

const failBuild = (editorVersion: string, extra: Record<string, unknown> = {}) =>
  call(reportBuildFailure, {
    jobId: jobIdFor(editorVersion),
    buildId: buildIdFor(editorVersion),
    reason: 'docker build exited with code 1',
    ...extra,
  });

const queueAcceptsFreshJobs = () => new Scheduler(repoVersionInfo).ensureThereAreNoFailedJobs();

const job = (editorVersion: string) => firestore.read('ciJobs', jobIdFor(editorVersion));
const build = (editorVersion: string) => firestore.read('ciBuilds', buildIdFor(editorVersion));

beforeEach(() => {
  firestore.clear();
  for (const editorVersion of editorVersions) {
    const [major, minor, patch] = editorVersion.split('.');
    firestore.seed('ciJobs', jobIdFor(editorVersion), {
      status: 'completed',
      imageType: 'editor',
      repoVersionInfo,
      editorVersionInfo: { version: editorVersion, major: +major, minor: +minor, patch },
      meta: { lastBuildStart: null, failureCount: 0, lastBuildFailure: null },
      addedDate: FakeTimestamp.now(),
      modifiedDate: FakeTimestamp.now(),
    });
  }
});

describe('reconciliation build failures', () => {
  it('records failed reconciliation builds without holding back the queue', async () => {
    for (const editorVersion of editorVersions) {
      expect(await startBuild(editorVersion, { reconciliation: true })).toBe(200);
      expect(await failBuild(editorVersion, { reconciliation: true })).toBe(200);
    }

    expect(await queueAcceptsFreshJobs()).toBe(true);
    for (const editorVersion of editorVersions) {
      expect(job(editorVersion).status).toBe('completed');
      expect(job(editorVersion).meta.reconciliationFailureCount).toBe(1);
      expect(build(editorVersion).status).toBe('failed');
      expect(build(editorVersion).meta.failureCount).toBe(1);
    }
  });

  it('still holds back the queue when normal builds keep failing', async () => {
    for (const editorVersion of editorVersions) {
      expect(await startBuild(editorVersion)).toBe(200);
      expect(await failBuild(editorVersion)).toBe(200);
    }

    expect(await queueAcceptsFreshJobs()).toBe(false);
    for (const editorVersion of editorVersions) {
      expect(job(editorVersion).status).toBe('failed');
      expect(job(editorVersion).meta.failureCount).toBe(1);
    }
  });

  it('recognises a reconciliation build from its start report when the failure report has no flag', async () => {
    const [editorVersion] = editorVersions;
    await startBuild(editorVersion, { reconciliation: 'true' });
    await failBuild(editorVersion);

    expect(job(editorVersion).status).toBe('completed');
    expect(job(editorVersion).meta.reconciliationFailureCount).toBe(1);
  });

  it('counts a normal retry of a build that first ran as reconciliation as a normal build', async () => {
    const [editorVersion] = editorVersions;
    await startBuild(editorVersion, { reconciliation: true });
    await failBuild(editorVersion, { reconciliation: true });
    await startBuild(editorVersion);
    await failBuild(editorVersion);

    expect(build(editorVersion).reconciliation).toBe(false);
    expect(job(editorVersion).status).toBe('failed');
  });

  it('does not fail the job when a reconciliation build never reports back', async () => {
    const [editorVersion] = editorVersions;
    await startBuild(editorVersion, { reconciliation: true });
    firestore.read('ciBuilds', buildIdFor(editorVersion)).meta.lastBuildStart =
      FakeTimestamp.fromMillis(Date.now() - 7 * 60 * 60 * 1000);

    await Cleaner.cleanUp('3.2.2', ActiveDockerRuns.none());

    expect(build(editorVersion).status).toBe('failed');
    expect(job(editorVersion).status).toBe('completed');
    expect(job(editorVersion).meta.reconciliationFailureCount).toBe(1);
  });
});

describe('stale jobs and reconciliation builds', () => {
  const twoHoursAgo = () => FakeTimestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
  const makeStale = (editorVersion: string, status: string) => {
    const stored = firestore.read('ciJobs', jobIdFor(editorVersion));
    stored.status = status;
    stored.modifiedDate = twoHoursAgo();
  };

  it('requeues a scheduled job whose only builds are failed reconciliation builds', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');
    await startBuild(editorVersion, { reconciliation: true });
    await failBuild(editorVersion, { reconciliation: true });
    makeStale(editorVersion, 'scheduled');

    await Cleaner.cleanUp('3.2.2', ActiveDockerRuns.none());

    expect(job(editorVersion).status).toBe('created');
  });

  it('leaves the job status alone when a reconciliation build starts', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');

    await startBuild(editorVersion, { reconciliation: true });

    expect(job(editorVersion).status).toBe('scheduled');
  });

  it('still fails a stale job whose queue builds all failed', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');
    await startBuild(editorVersion);
    firestore.read('ciBuilds', buildIdFor(editorVersion)).status = 'failed';
    makeStale(editorVersion, 'inProgress');

    await Cleaner.cleanUp('3.2.2', ActiveDockerRuns.none());

    expect(job(editorVersion).status).toBe('failed');
  });
});

describe('stale jobs still waiting for a GitHub runner', () => {
  const twoHoursAgo = () => FakeTimestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
  const makeStale = (editorVersion: string, status: string) => {
    const stored = firestore.read('ciJobs', jobIdFor(editorVersion));
    stored.status = status;
    stored.modifiedDate = twoHoursAgo();
  };
  const runsFor = (...editorVersions: string[]) =>
    ActiveDockerRuns.fromRunTitles(
      editorVersions.map((version) => `${jobIdFor(version)} · New Ubuntu Editor Version 🗔`),
    );

  it('leaves a scheduled job alone while its run waits in the GitHub queue', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');

    await Cleaner.cleanUp('3.2.2', runsFor(editorVersion));

    expect(job(editorVersion).status).toBe('scheduled');
  });

  it('still requeues a scheduled job that has no run on GitHub', async () => {
    const [editorVersion, otherVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');

    await Cleaner.cleanUp('3.2.2', runsFor(otherVersion));

    expect(job(editorVersion).status).toBe('created');
  });

  it('does not fail a job whose other platforms are still waiting for runners', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');
    await startBuild(editorVersion);
    firestore.read('ciBuilds', buildIdFor(editorVersion)).status = 'failed';
    makeStale(editorVersion, 'inProgress');

    await Cleaner.cleanUp('3.2.2', runsFor(editorVersion));

    expect(job(editorVersion).status).toBe('inProgress');
  });

  it('resets no job when GitHub could not be asked about its runs', async () => {
    const [editorVersion] = editorVersions;
    makeStale(editorVersion, 'scheduled');

    await Cleaner.cleanUp('3.2.2', null);

    expect(job(editorVersion).status).toBe('scheduled');
  });
});
