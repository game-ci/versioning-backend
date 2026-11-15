import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const store = new Map<string, Record<string, any>>();

const fakeDb = {
  collection: () => ({ doc: (id: string) => ({ id }) }),
  runTransaction: async (update: (transaction: any) => Promise<void>) => {
    await update({
      get: async ({ id }: { id: string }) => ({
        exists: store.has(id),
        data: () => store.get(id),
      }),
      update: ({ id }: { id: string }, data: Record<string, any>) => {
        store.set(id, { ...store.get(id), ...data });
      },
    });
  },
};

vi.mock('../src/service/firebase', () => ({
  db: fakeDb,
  admin: {
    firestore: {
      FieldValue: { increment: (by: number) => `increment(${by})` },
      DocumentSnapshot: {},
      Timestamp: { now: () => 'now' },
    },
  },
}));

const { CiJobs } = await import('../src/model/ciJobs');

beforeEach(() => {
  store.clear();
});

describe('CiJobs.markFailureForJob', () => {
  it.each(['created', 'scheduled', 'inProgress', 'failed'])(
    'marks a %s job as failed and records the failure',
    async (status) => {
      store.set('job', { status });

      await CiJobs.markFailureForJob('job');

      expect(store.get('job')).toEqual({
        status: 'failed',
        'meta.failureCount': 'increment(1)',
        'meta.lastBuildFailure': 'now',
        modifiedDate: 'now',
      });
    },
  );

  it('records the failure but keeps a deprecated job deprecated, so it is never retried', async () => {
    store.set('job', { status: 'deprecated' });

    await CiJobs.markFailureForJob('job');

    expect(store.get('job')).toMatchObject({
      status: 'deprecated',
      'meta.failureCount': 'increment(1)',
    });
  });

  it('refuses to mark a job that does not exist', async () => {
    await expect(CiJobs.markFailureForJob('missing')).rejects.toThrow(
      "Trying to mark job 'missing' as failed. But it does not exist.",
    );
  });
});
