import { describe, it, expect } from 'vitest';
import {
  compareEditorVersions,
  latestVersionOfEachMinor,
  orderBuildQueue,
} from '../src/model/buildQueueOrder';

const job = (version: string) => {
  const [major, minor, patch] = version.split('.');
  return {
    id: `editor-${version}-4.0.0`,
    data: { editorVersionInfo: { version, major: Number(major), minor: Number(minor), patch } },
  } as any;
};
const versionsOf = (queue: any[]) => queue.map((item) => item.data.editorVersionInfo.version);

describe('compareEditorVersions', () => {
  it('compares patches numerically, not as text', () => {
    expect(compareEditorVersions('6000.0.85f2', '6000.0.9f1')).toBeGreaterThan(0);
  });

  it('orders release stages within the same patch number', () => {
    expect(compareEditorVersions('2022.3.62f3', '2022.3.62f1')).toBeGreaterThan(0);
    expect(compareEditorVersions('2022.3.62f1', '2022.3.62b5')).toBeGreaterThan(0);
  });

  it('parses a hyphenated build number', () => {
    expect(compareEditorVersions('6000.0.85f-1', '6000.0.84f1')).toBeGreaterThan(0);
  });

  it('orders by major, then minor', () => {
    expect(compareEditorVersions('6000.0.1f1', '2023.2.22f1')).toBeGreaterThan(0);
    expect(compareEditorVersions('2022.3.1f1', '2022.2.23f1')).toBeGreaterThan(0);
  });
});

describe('latestVersionOfEachMinor', () => {
  it('picks the newest patch of every minor version', () => {
    const latest = latestVersionOfEachMinor([
      '6000.6.8f1',
      '6000.6.9f1',
      '2022.3.62f3',
      '2022.3.9f1',
    ]);

    expect([...latest].toSorted()).toEqual(['2022.3.62f3', '6000.6.9f1']);
  });
});

describe('orderBuildQueue', () => {
  const known = [
    '6000.6.9f1',
    '6000.6.8f1',
    '6000.5.11f1',
    '6000.5.10f1',
    '2023.2.22f1',
    '2022.3.62f3',
    '2022.3.61f1',
  ];
  const latest = latestVersionOfEachMinor(known);

  it('builds the latest patch of every minor version first, newest minor first', () => {
    const queue = orderBuildQueue(known.map(job), latest);

    expect(versionsOf(queue).slice(0, 4)).toEqual([
      '6000.6.9f1',
      '6000.5.11f1',
      '2023.2.22f1',
      '2022.3.62f3',
    ]);
  });

  it('then builds the remaining versions newest first, comparing patches numerically', () => {
    const versions = ['2022.3.61f1', '6000.0.9f1', '6000.0.85f2', '6000.6.8f1'];
    const queue = orderBuildQueue(
      versions.map(job),
      latestVersionOfEachMinor(['6000.0.85f2', '6000.6.9f1', '2022.3.62f3']),
    );

    expect(versionsOf(queue)).toEqual(['6000.0.85f2', '6000.6.8f1', '6000.0.9f1', '2022.3.61f1']);
  });

  it('keeps every minor version ahead of a second patch, across scheduler runs', () => {
    const queued = new Set(known);
    const dispatched: string[] = [];
    for (let run = 0; run < 4; run += 1) {
      const [next] = versionsOf(orderBuildQueue([...queued].map(job), latest));
      dispatched.push(next);
      queued.delete(next);
    }

    expect(dispatched).toEqual(['6000.6.9f1', '6000.5.11f1', '2023.2.22f1', '2022.3.62f3']);
  });

  it('promotes one job per minor version, preferring the rollout job over a dry run', () => {
    const dryRun = { ...job('6000.6.9f1'), id: 'dryRun-1-editor-6000.6.9f1-0.1' };
    const queue = orderBuildQueue([dryRun, job('6000.6.9f1'), job('2022.3.62f3')], latest);

    expect(queue.map(({ id }) => id)).toEqual([
      'editor-6000.6.9f1-4.0.0',
      'editor-2022.3.62f3-4.0.0',
      'dryRun-1-editor-6000.6.9f1-0.1',
    ]);
  });

  it('never promotes a dry run, even after its rollout job was dispatched', () => {
    const dryRun = { ...job('6000.6.9f1'), id: 'dryRun-1-editor-6000.6.9f1-0.1' };
    const queue = orderBuildQueue([dryRun, job('2022.3.62f3')], latest);

    expect(queue.map(({ id }) => id)).toEqual([
      'editor-2022.3.62f3-4.0.0',
      'dryRun-1-editor-6000.6.9f1-0.1',
    ]);
  });

  it('keeps jobs without an editor version out of the editor queue', () => {
    const base = { id: 'base-4.0.0', data: { editorVersionInfo: null } } as any;

    expect(orderBuildQueue([base, job('6000.6.9f1')], latest).map(({ id }) => id)).toEqual([
      'editor-6000.6.9f1-4.0.0',
    ]);
  });

  it('returns an empty queue unchanged', () => {
    expect(orderBuildQueue([], latest)).toEqual([]);
  });
});
