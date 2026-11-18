import { describe, it, expect } from 'vitest';
import { compareEditorVersions, orderBuildQueue } from '../src/model/buildQueueOrder';

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

  it('orders by major, then minor', () => {
    expect(compareEditorVersions('6000.0.1f1', '2023.2.22f1')).toBeGreaterThan(0);
    expect(compareEditorVersions('2022.3.1f1', '2022.2.23f1')).toBeGreaterThan(0);
  });
});

describe('orderBuildQueue', () => {
  it('builds the latest patch of every minor version first, newest minor first', () => {
    const queue = orderBuildQueue(
      [
        '6000.6.8f1',
        '2022.3.61f1',
        '6000.6.9f1',
        '2022.3.62f3',
        '2023.2.22f1',
        '6000.5.11f1',
        '6000.5.10f1',
      ].map(job),
    );

    expect(versionsOf(queue).slice(0, 4)).toEqual([
      '6000.6.9f1',
      '6000.5.11f1',
      '2023.2.22f1',
      '2022.3.62f3',
    ]);
  });

  it('then builds the remaining versions newest first', () => {
    const queue = orderBuildQueue(
      ['2022.3.61f1', '6000.6.8f1', '6000.0.9f1', '6000.0.85f2', '6000.6.9f1', '2022.3.62f3'].map(
        job,
      ),
    );

    expect(versionsOf(queue)).toEqual([
      '6000.6.9f1',
      '6000.0.85f2',
      '2022.3.62f3',
      '6000.6.8f1',
      '6000.0.9f1',
      '2022.3.61f1',
    ]);
  });

  it('keeps jobs without an editor version out of the editor queue', () => {
    const base = { id: 'base-4.0.0', data: { editorVersionInfo: null } } as any;

    expect(orderBuildQueue([base, job('6000.6.9f1')]).map(({ id }) => id)).toEqual([
      'editor-6000.6.9f1-4.0.0',
    ]);
  });

  it('returns an empty queue unchanged', () => {
    expect(orderBuildQueue([])).toEqual([]);
  });
});
