import { describe, it, expect, vi } from 'vitest';
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

describe('UnfinishedWorkflowRuns.fetchJobIds', () => {
  const runsByStatus: Record<string, { display_title: string }[]> = {
    queued: [
      { display_title: 'New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]' },
      { display_title: 'New Windows Editor Version 🗔 [editor-2022.3.42f1-4.0.0]' },
    ],
    in_progress: [
      { display_title: 'Retry Building Windows Editor Version 🗔 [editor-6000.0.3f1-4.0.0]' },
      { display_title: 'Test' },
    ],
  };

  const listWorkflowRunsForRepo = vi.fn();
  const paginate = vi.fn(async (_route: unknown, { status }: { status: string }) => {
    return runsByStatus[status] ?? [];
  });
  const gitHub = { paginate, actions: { listWorkflowRunsForRepo } } as any;

  it('collects the job ids of every run GitHub has not finished', async () => {
    const jobIds = await UnfinishedWorkflowRuns.fetchJobIds(gitHub);

    expect([...jobIds].toSorted()).toEqual(['editor-2022.3.42f1-4.0.0', 'editor-6000.0.3f1-4.0.0']);
  });

  it('asks the docker repository for each unfinished status', async () => {
    paginate.mockClear();

    await UnfinishedWorkflowRuns.fetchJobIds(gitHub);

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
