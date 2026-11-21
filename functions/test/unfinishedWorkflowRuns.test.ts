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

type Run = { display_title: string; event: string };

const dispatched = (display_title: string): Run => ({
  display_title,
  event: 'repository_dispatch',
});

describe('UnfinishedWorkflowRuns.fetch', () => {
  let runsByStatus: Record<string, Run[]> = {};

  const listWorkflowRunsForRepo = vi.fn();
  const paginate = vi.fn(async (_route: unknown, { status }: { status: string }) => {
    return runsByStatus[status] ?? [];
  });
  const gitHub = { paginate, actions: { listWorkflowRunsForRepo } } as any;

  beforeEach(() => {
    paginate.mockClear();
    runsByStatus = {
      queued: [
        dispatched('New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
        dispatched('New Windows Editor Version 🗔 [editor-2022.3.42f1-4.0.0]'),
      ],
      in_progress: [
        dispatched('Retry Building Windows Editor Version 🗔 [editor-6000.0.3f1-4.0.0]'),
        { display_title: 'Test', event: 'pull_request' },
      ],
    };
  });

  it('collects the job ids of every run GitHub has not finished', async () => {
    const { jobIds } = await UnfinishedWorkflowRuns.fetch(gitHub);

    expect([...jobIds].toSorted()).toEqual(['editor-2022.3.42f1-4.0.0', 'editor-6000.0.3f1-4.0.0']);
  });

  it('counts no unidentified dispatches when every dispatched run names its job', async () => {
    const { unidentifiedDispatches } = await UnfinishedWorkflowRuns.fetch(gitHub);

    expect(unidentifiedDispatches).toBe(0);
  });

  it('counts dispatched runs that do not name their job', async () => {
    runsByStatus.queued.push(dispatched('new_post_2019_2_editor_image_requested'));

    const { unidentifiedDispatches } = await UnfinishedWorkflowRuns.fetch(gitHub);

    expect(unidentifiedDispatches).toBe(1);
  });

  it('asks the docker repository for each unfinished status', async () => {
    await UnfinishedWorkflowRuns.fetch(gitHub);

    const statuses = paginate.mock.calls.map(([, params]) => params.status);
    expect(statuses.toSorted()).toEqual([
      'in_progress',
      'pending',
      'queued',
      'requested',
      'waiting',
    ]);
    for (const [route, params] of paginate.mock.calls) {
      expect(route).toBe(listWorkflowRunsForRepo);
      expect(params).toMatchObject({ owner: 'game-ci', repo: 'docker', per_page: 100 });
    }
  });
});
