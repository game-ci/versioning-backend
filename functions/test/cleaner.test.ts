import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/service/firebase', () => ({ db: {}, admin: { firestore: {} } }));

vi.mock('../src/service/discord', () => ({
  Discord: {
    sendDebug: vi.fn().mockResolvedValue(undefined),
    sendAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/service/dockerhub', () => ({
  Dockerhub: { fetchImageData: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../src/model/ciJobs', () => ({
  CiJobs: {
    getActiveJobs: vi.fn(),
    resetJobToCreated: vi.fn().mockResolvedValue(undefined),
    markFailureForJob: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/model/ciBuilds', () => ({
  CiBuilds: {
    getQueueBuildsForJob: vi.fn().mockResolvedValue([]),
    getMaxedOutFailedBuildsForRepoVersion: vi.fn().mockResolvedValue([]),
    getStartedBuilds: vi.fn().mockResolvedValue([]),
    getFailedBuilds: vi.fn().mockResolvedValue([]),
  },
}));

const { Cleaner } = await import('../src/logic/buildQueue/cleaner');
const { CiJobs } = await import('../src/model/ciJobs');
const { Discord } = await import('../src/service/discord');
const { CiBuilds } = await import('../src/model/ciBuilds');

const minutesAgo = (minutes: number) => ({ seconds: Math.floor(Date.now() / 1000) - minutes * 60 });

const runs = (jobIds: string[], unidentifiedDispatches = 0) => ({
  jobIds: new Set(jobIds),
  unidentifiedDispatches,
});

const scheduledJob = (id: string, minutesSinceScheduled: number) => ({
  id,
  data: { status: 'scheduled', modifiedDate: minutesAgo(minutesSinceScheduled) },
});

describe('Cleaner, for active jobs without build records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves a stale job alone while GitHub still has an unfinished run for it', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs(['editor-2022.3.42f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
    expect(Discord.sendAlert).not.toHaveBeenCalled();
  });

  it('resets a stale job that GitHub has no unfinished run for', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs(['editor-6000.0.3f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(CiJobs.resetJobToCreated).toHaveBeenCalledWith('editor-2022.3.42f1-4.0.0');
    expect(Discord.sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('no queued or running workflow run'),
    );
  });

  it('asks GitHub once for all stale jobs', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
      scheduledJob('editor-2022.3.36f1-4.0.0', 60),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs(['editor-2022.3.36f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(fetchUnfinishedRuns).toHaveBeenCalledTimes(1);
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledTimes(1);
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledWith('editor-2022.3.42f1-4.0.0');
  });

  it('resets no job while a dispatched run cannot be matched to its job', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs([], 1));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
    expect(Discord.sendDebug).toHaveBeenCalledWith(expect.stringContaining('cannot be matched'));
  });

  it('does not ask GitHub while no job is stale', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 10),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs([]));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(fetchUnfinishedRuns).not.toHaveBeenCalled();
    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
  });

  it('does not ask GitHub about a job that has build records', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    vi.mocked(CiBuilds.getQueueBuildsForJob).mockResolvedValueOnce([{ status: 'started' }] as any);
    const fetchUnfinishedRuns = vi.fn(async () => runs([]));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(fetchUnfinishedRuns).not.toHaveBeenCalled();
    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
  });

  it('alerts and resets no job when GitHub cannot be asked', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const fetchUnfinishedRuns = vi.fn(async () => {
      throw new Error('Bad credentials');
    });

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(Discord.sendAlert).toHaveBeenCalledWith(expect.stringContaining('Bad credentials'));
    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
  });
});

const inProgressJob = (id: string, minutesSinceTouched: number) => ({
  id,
  data: { status: 'inProgress', modifiedDate: minutesAgo(minutesSinceTouched) },
});

describe('Cleaner, for in-progress jobs whose recorded builds have settled', () => {
  const jobId = 'editor-2022.3.42f1-4.0.0';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([inProgressJob(jobId, 90)] as any);
    vi.mocked(CiBuilds.getQueueBuildsForJob).mockResolvedValue([{ status: 'failed' }] as any);
  });

  it('leaves the job alone while its other platforms still wait for a runner', async () => {
    await Cleaner.cleanUp(
      '4.0.0',
      vi.fn(async () => runs([jobId])),
    );

    expect(CiJobs.markFailureForJob).not.toHaveBeenCalled();
  });

  it('fails the job once GitHub has no unfinished run for it', async () => {
    await Cleaner.cleanUp(
      '4.0.0',
      vi.fn(async () => runs([])),
    );

    expect(CiJobs.markFailureForJob).toHaveBeenCalledWith(jobId);
  });

  it('fails no job while a dispatched run cannot be matched to its job', async () => {
    await Cleaner.cleanUp(
      '4.0.0',
      vi.fn(async () => runs([], 1)),
    );

    expect(CiJobs.markFailureForJob).not.toHaveBeenCalled();
  });

  it('fails no job when GitHub cannot be asked', async () => {
    const fetchUnfinishedRuns = vi.fn(async () => {
      throw new Error('Bad credentials');
    });

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(CiJobs.markFailureForJob).not.toHaveBeenCalled();
  });

  it('asks GitHub once per pass for scheduled and in-progress jobs together', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.36f1-4.0.0', 90),
      inProgressJob(jobId, 90),
    ] as any);
    vi.mocked(CiBuilds.getQueueBuildsForJob).mockImplementation(async (id: string) =>
      id === jobId ? ([{ status: 'failed' }] as any) : [],
    );
    const fetchUnfinishedRuns = vi.fn(async () => runs([]));

    await Cleaner.cleanUp('4.0.0', fetchUnfinishedRuns);

    expect(fetchUnfinishedRuns).toHaveBeenCalledTimes(1);
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledWith('editor-2022.3.36f1-4.0.0');
    expect(CiJobs.markFailureForJob).toHaveBeenCalledWith(jobId);
  });
});
