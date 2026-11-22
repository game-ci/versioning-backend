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

type Run = { display_title: string; event: string; status: string };

const dispatched = (display_title: string, status = 'queued'): Run => ({
  display_title,
  event: 'repository_dispatch',
  status,
});

describe('UnfinishedWorkflowRuns.fetch', () => {
  let runs: Run[] = [];
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);

  const listWorkflowRunsForRepo = vi.fn();
  const paginate = vi.fn(async (_route: unknown, _params: Record<string, unknown>) => runs);
  const gitHub = { paginate, actions: { listWorkflowRunsForRepo } } as any;

  beforeEach(() => {
    paginate.mockClear();
    runs = [
      dispatched('New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
      dispatched('New Windows Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
      dispatched(
        'Retry Building Windows Editor Version 🗔 [editor-6000.0.3f1-4.0.0]',
        'in_progress',
      ),
      { display_title: 'Test', event: 'pull_request', status: 'in_progress' },
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

    expect(paginate).toHaveBeenCalledTimes(1);
    const [route, params] = paginate.mock.calls[0];
    expect(route).toBe(listWorkflowRunsForRepo);
    expect(params).toMatchObject({
      owner: 'game-ci',
      repo: 'docker',
      per_page: 100,
      created: '>=2026-11-19T12:00:00.000Z',
    });
    expect(params).not.toHaveProperty('status');
  });
});
