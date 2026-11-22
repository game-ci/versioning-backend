import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnfinishedWorkflowRuns } from '../src/model/unfinishedWorkflowRuns';

describe('UnfinishedWorkflowRuns.jobIdFromRunName', () => {
  it('reads the job id between the trailing brackets', () => {
    const runName = 'New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]';

    expect(UnfinishedWorkflowRuns.jobIdFromRunName(runName)).toBe('editor-2022.3.42f1-4.0.0');
  });

  it('finds no job id in a run named before job ids were added', () => {
    expect(UnfinishedWorkflowRuns.jobIdFromRunName('New Ubuntu Editor Version 🗔')).toBeNull();
  });

  it('finds no job id in empty brackets', () => {
    expect(UnfinishedWorkflowRuns.jobIdFromRunName('Test [] run')).toBeNull();
    expect(UnfinishedWorkflowRuns.jobIdFromRunName('New Ubuntu Hub Version ⚙ []')).toBeNull();
  });
});

type Run = { id: number; display_title: string; event: string; status: string };

let nextRunId = 1;
const dispatched = (display_title: string, status = 'queued'): Run => ({
  id: nextRunId++,
  display_title,
  event: 'repository_dispatch',
  status,
});

describe('UnfinishedWorkflowRuns.fetch', () => {
  let runs: Run[] = [];
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);

  const listWorkflowRunsForRepo = vi.fn();
  // Every run lands in the first slice searched unless a test says otherwise.
  let runsInSlice = (sliceIndex: number): Run[] => (sliceIndex === 0 ? runs : []);
  let totalCountInSlice = (sliceIndex: number): number => runsInSlice(sliceIndex).length;
  const iterator = vi.fn((_route: unknown, _params: Record<string, unknown>) => {
    const sliceIndex = (iterator.mock.calls.length - 1) % 8;
    const page = Object.assign([...runsInSlice(sliceIndex)], {
      total_count: totalCountInSlice(sliceIndex),
    });
    return (async function* () {
      yield { data: page };
    })();
  });
  const gitHub = { paginate: { iterator }, actions: { listWorkflowRunsForRepo } } as any;

  beforeEach(() => {
    iterator.mockClear();
    runsInSlice = (sliceIndex) => (sliceIndex === 0 ? runs : []);
    totalCountInSlice = (sliceIndex) => runsInSlice(sliceIndex).length;
    runs = [
      dispatched('New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
      dispatched('New Windows Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
      dispatched(
        'Retry Building Windows Editor Version 🗔 [editor-6000.0.3f1-4.0.0]',
        'in_progress',
      ),
      { id: nextRunId++, display_title: 'Test', event: 'pull_request', status: 'in_progress' },
      dispatched('New Ubuntu Editor Version 🗔 [editor-2021.3.1f1-4.0.0]', 'completed'),
      dispatched('new_post_2019_2_editor_image_requested', 'completed'),
    ];
  });

  it('collects the job ids of every run GitHub has not finished', async () => {
    const { jobIds } = await UnfinishedWorkflowRuns.fetch(gitHub, now);

    expect([...jobIds].toSorted()).toEqual(['editor-2022.3.42f1-4.0.0', 'editor-6000.0.3f1-4.0.0']);
  });

  it('counts no unidentified dispatches when every dispatched run names its job', async () => {
    const { unidentifiedDispatches } = await UnfinishedWorkflowRuns.fetch(gitHub, now);

    expect(unidentifiedDispatches).toBe(0);
  });

  it('counts dispatched runs that do not name their job', async () => {
    runs.push(dispatched('new_post_2019_2_editor_image_requested'));

    const { unidentifiedDispatches } = await UnfinishedWorkflowRuns.fetch(gitHub, now);

    expect(unidentifiedDispatches).toBe(1);
  });

  it('lists the docker runs by creation time, so a status change mid-sweep cannot hide one', async () => {
    await UnfinishedWorkflowRuns.fetch(gitHub, now);

    const searches = iterator.mock.calls.map(([route, params]) => {
      expect(route).toBe(listWorkflowRunsForRepo);
      expect(params).toMatchObject({ owner: 'game-ci', repo: 'docker', per_page: 100 });
      expect(params).not.toHaveProperty('status');
      return params.created;
    });
    expect(searches).toHaveLength(8);
    expect(searches[0]).toBe('2026-11-19T12:00:00.000Z..2026-11-19T18:00:00.000Z');
    expect(searches[7]).toBe('2026-11-21T06:00:00.000Z..2026-11-21T12:00:00.000Z');
  });

  it('counts a run once when it falls on the edge of two searches', async () => {
    runsInSlice = (sliceIndex) => (sliceIndex <= 1 ? runs : []);

    const { unidentifiedDispatches } = await UnfinishedWorkflowRuns.fetch(gitHub, now);
    runs.push(dispatched('new_post_2019_2_editor_image_requested'));
    const again = await UnfinishedWorkflowRuns.fetch(gitHub, now);

    expect(unidentifiedDispatches).toBe(0);
    expect(again.unidentifiedDispatches).toBe(1);
  });

  it('refuses to answer when GitHub would cut a search short', async () => {
    totalCountInSlice = (sliceIndex) => (sliceIndex === 3 ? 1001 : 0);

    await expect(UnfinishedWorkflowRuns.fetch(gitHub, now)).rejects.toThrow(/1,000/);
  });
});
