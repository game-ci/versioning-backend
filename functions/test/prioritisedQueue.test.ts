import { describe, it, expect, vi } from 'vitest';

const queryLog: unknown[][] = [];
const queuedDocs = ['6000.6.8f1', '2022.3.62f3', '6000.6.9f1', '2022.3.61f1'].map((version) => {
  const [major, minor, patch] = version.split('.');
  return {
    id: `editor-${version}-4.0.0`,
    data: () => ({
      status: 'created',
      editorVersionInfo: { version, major: Number(major), minor: Number(minor), patch },
    }),
  };
});

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/service/firebase', () => {
  const query = {
    where: (...args: unknown[]) => {
      queryLog.push(['where', ...args]);
      return query;
    },
    get: async () => ({ docs: queuedDocs }),
  };
  return {
    db: { collection: () => query },
    admin: { firestore: { FieldValue: {}, DocumentSnapshot: {}, Timestamp: { now: () => 'now' } } },
  };
});

const { CiJobs } = await import('../src/model/ciJobs');

describe('CiJobs.getPrioritisedQueue', () => {
  it('returns every queued editor job, latest of each minor version first', async () => {
    const queue = await CiJobs.getPrioritisedQueue();

    expect(queryLog).toEqual([['where', 'status', '==', 'created']]);
    expect(queue.map(({ id }) => id)).toEqual([
      'editor-6000.6.9f1-4.0.0',
      'editor-2022.3.62f3-4.0.0',
      'editor-6000.6.8f1-4.0.0',
      'editor-2022.3.61f1-4.0.0',
    ]);
  });
});
