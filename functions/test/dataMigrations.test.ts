import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type StoredJob = { data: Record<string, any>; updateTime: number };

const store = new Map<string, StoredJob>();
const queriedFilters: Array<[string, string, unknown]> = [];
const committedBatchSizes: number[] = [];

const snapshotOf = (id: string) => {
  const { data, updateTime } = store.get(id)!;
  return { id, ref: { id }, updateTime, data: () => structuredClone(data) };
};

const fakeDb = {
  collection: (name: string) => {
    expect(name).toBe('ciJobs');
    return {
      where: (field: string, operator: string, value: unknown) => {
        queriedFilters.push([field, operator, value]);
        expect([field, operator]).toEqual(['status', '==']);
        return {
          get: async () => {
            const ids = [...store.keys()].filter((id) => store.get(id)!.data.status === value);
            return { docs: ids.map(snapshotOf) };
          },
        };
      },
    };
  },
  batch: () => {
    const writes: Array<{ id: string; data: Record<string, any>; lastUpdateTime: number }> = [];
    return {
      update: (ref: { id: string }, data: Record<string, any>, precondition: any) => {
        writes.push({ id: ref.id, data, lastUpdateTime: precondition?.lastUpdateTime });
      },
      commit: async () => {
        for (const { id, lastUpdateTime } of writes) {
          if (store.get(id)!.updateTime !== lastUpdateTime) {
            throw new Error(`FAILED_PRECONDITION: ${id} changed since it was read`);
          }
        }
        for (const { id, data } of writes) {
          const job = store.get(id)!;
          store.set(id, { data: { ...job.data, ...data }, updateTime: job.updateTime + 1 });
        }
        committedBatchSizes.push(writes.length);
      },
    };
  },
};

vi.mock('../src/service/firebase', () => ({
  db: fakeDb,
  admin: {
    firestore: {
      FieldValue: {},
      DocumentSnapshot: {},
      Timestamp: { now: () => 'now' },
    },
  },
}));

const { logger } = await import('firebase-functions/v2');
const { migrateEndOfLifeEditorJobsToDeprecated, dataMigrations } =
  await import('../src/logic/dataTransformation/dataMigrations');

const editorVersionInfo = (version: string) => ({
  version,
  major: Number(version.split('.')[0]),
  minor: Number(version.split('.')[1]),
  patch: version.split('.')[2],
});

let nextId = 0;
const addJob = (status: string, editorVersion: string | null) => {
  const id = `job-${nextId++}`;
  store.set(id, {
    updateTime: 1,
    data: {
      status,
      imageType: editorVersion === null ? 'base' : 'editor',
      editorVersionInfo: editorVersion === null ? null : editorVersionInfo(editorVersion),
      modifiedDate: 'earlier',
    },
  });
  return id;
};

const statusOf = (id: string) => store.get(id)!.data.status;

beforeEach(() => {
  store.clear();
  queriedFilters.length = 0;
  committedBatchSizes.length = 0;
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.debug).mockClear();
});

describe('migrateEndOfLifeEditorJobsToDeprecated', () => {
  it.each(['created', 'failed', 'scheduled', 'inProgress'])(
    'deprecates %s jobs for end-of-life editors',
    async (status) => {
      const id = addJob(status, '2021.3.45f2');

      await migrateEndOfLifeEditorJobsToDeprecated();

      expect(store.get(id)!.data).toMatchObject({ status: 'deprecated', modifiedDate: 'now' });
    },
  );

  it.each(['completed', 'superseded', 'deprecated'])(
    'leaves %s jobs for end-of-life editors untouched',
    async (status) => {
      const id = addJob(status, '2019.4.41f2');

      await migrateEndOfLifeEditorJobsToDeprecated();

      expect(store.get(id)).toEqual({
        updateTime: 1,
        data: expect.objectContaining({ status, modifiedDate: 'earlier' }),
      });
    },
  );

  it('only queries statuses the scheduler can still dispatch', async () => {
    await migrateEndOfLifeEditorJobsToDeprecated();

    expect(queriedFilters.map(([, , status]) => status).toSorted()).toEqual([
      'created',
      'failed',
      'inProgress',
      'scheduled',
    ]);
  });

  it('leaves supported editors and base or hub jobs schedulable', async () => {
    const supported = addJob('created', '2022.1.0f1');
    const latest = addJob('failed', '6000.0.85f2');
    const base = addJob('created', null);

    await migrateEndOfLifeEditorJobsToDeprecated();

    expect([statusOf(supported), statusOf(latest), statusOf(base)]).toEqual([
      'created',
      'failed',
      'created',
    ]);
    expect(committedBatchSizes).toEqual([]);
  });

  it('commits writes in batches within the Firestore limit', async () => {
    for (let index = 0; index < 600; index += 1) addJob('created', '2020.3.49f1');

    await migrateEndOfLifeEditorJobsToDeprecated();

    expect(committedBatchSizes).toEqual([250, 250, 100]);
    expect([...store.values()].every(({ data }) => data.status === 'deprecated')).toBe(true);
  });

  it('changes nothing when run again', async () => {
    addJob('created', '2018.4.36f1');
    addJob('failed', '2021.3.45f2');
    await migrateEndOfLifeEditorJobsToDeprecated();
    committedBatchSizes.length = 0;

    const secondRun = await migrateEndOfLifeEditorJobsToDeprecated();

    expect(secondRun.total).toBe(0);
    expect(committedBatchSizes).toEqual([]);
  });

  it('never overwrites a job that changed after it was read', async () => {
    const id = addJob('created', '2021.3.45f2');
    const originalBatch = fakeDb.batch;
    const batchSpy = vi.spyOn(fakeDb, 'batch').mockImplementation(() => {
      const batch = originalBatch();
      store.set(id, { data: { ...store.get(id)!.data, status: 'completed' }, updateTime: 2 });
      return batch;
    });

    await expect(migrateEndOfLifeEditorJobsToDeprecated()).rejects.toThrow('FAILED_PRECONDITION');
    expect(statusOf(id)).toBe('completed');

    batchSpy.mockRestore();
  });

  it('reports and logs counts per status and editor version', async () => {
    addJob('created', '2021.3.45f2');
    addJob('created', '2021.3.45f2');
    addJob('failed', '2021.3.45f2');
    addJob('scheduled', '2019.4.41f2');
    addJob('created', '2022.3.62f3');

    const summary = await migrateEndOfLifeEditorJobsToDeprecated();

    const expected = {
      total: 4,
      byStatus: { created: 2, failed: 1, scheduled: 1 },
      byEditorVersion: { '2021.3.45f2': 3, '2019.4.41f2': 1 },
    };
    expect(summary).toEqual(expected);
    expect(logger.info).toHaveBeenCalledWith(
      '[Migration] Deprecated 4 CI Jobs for end-of-life editors.',
      expected,
    );
  });

  it('logs that there was nothing to deprecate', async () => {
    await migrateEndOfLifeEditorJobsToDeprecated();

    expect(logger.debug).toHaveBeenCalledWith(
      '[Migration] No schedulable CI Jobs for end-of-life editors left to deprecate.',
    );
  });
});

describe('dataMigrations', () => {
  it('deprecates schedulable jobs for end-of-life editors', async () => {
    const id = addJob('created', '2021.3.45f2');

    await dataMigrations();

    expect(statusOf(id)).toBe('deprecated');
  });
});
