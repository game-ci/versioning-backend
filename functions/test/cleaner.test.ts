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
    const unfinishedRunJobIds = vi.fn(async () => new Set(['editor-2022.3.42f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
    expect(Discord.sendAlert).not.toHaveBeenCalled();
  });

  it('resets a stale job that GitHub has no unfinished run for', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const unfinishedRunJobIds = vi.fn(async () => new Set(['editor-6000.0.3f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

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
    const unfinishedRunJobIds = vi.fn(async () => new Set(['editor-2022.3.36f1-4.0.0']));

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

    expect(unfinishedRunJobIds).toHaveBeenCalledTimes(1);
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledTimes(1);
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledWith('editor-2022.3.42f1-4.0.0');
  });

  it('does not ask GitHub while no job is stale', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 10),
    ] as any);
    const unfinishedRunJobIds = vi.fn(async () => new Set<string>());

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

    expect(unfinishedRunJobIds).not.toHaveBeenCalled();
    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
  });

  it('does not ask GitHub about a job that has build records', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    vi.mocked(CiBuilds.getQueueBuildsForJob).mockResolvedValueOnce([{ status: 'started' }] as any);
    const unfinishedRunJobIds = vi.fn(async () => new Set<string>());

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

    expect(unfinishedRunJobIds).not.toHaveBeenCalled();
    expect(CiJobs.resetJobToCreated).not.toHaveBeenCalled();
  });

  it('alerts and still resets stale jobs when GitHub cannot be asked', async () => {
    vi.mocked(CiJobs.getActiveJobs).mockResolvedValue([
      scheduledJob('editor-2022.3.42f1-4.0.0', 90),
    ] as any);
    const unfinishedRunJobIds = vi.fn(async () => {
      throw new Error('Bad credentials');
    });

    await Cleaner.cleanUp('4.0.0', unfinishedRunJobIds);

    expect(Discord.sendAlert).toHaveBeenCalledWith(expect.stringContaining('Bad credentials'));
    expect(CiJobs.resetJobToCreated).toHaveBeenCalledWith('editor-2022.3.42f1-4.0.0');
  });
});
