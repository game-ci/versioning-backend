import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { ActiveDockerRuns } = await import('../src/logic/buildQueue/activeDockerRuns');

describe('ActiveDockerRuns.fromRunTitles', () => {
  it('reads the job ID that leads each run title', () => {
    const runs = ActiveDockerRuns.fromRunTitles([
      'editor-2022.3.26f1-4.0.0 · New Ubuntu Editor Version 🗔',
      'base-4.0.0 · New Windows Base Version ⛭',
    ]);

    expect(ActiveDockerRuns.has(runs, 'editor-2022.3.26f1-4.0.0')).toBe(true);
    expect(ActiveDockerRuns.has(runs, 'base-4.0.0')).toBe(true);
  });

  it('does not match a job whose ID only prefixes another', () => {
    const runs = ActiveDockerRuns.fromRunTitles(['editor-2022.3.26f1-4.0.0 · New Ubuntu Editor']);

    expect(ActiveDockerRuns.has(runs, 'editor-2022.3.2')).toBe(false);
  });

  it('ignores runs that were not named after a job', () => {
    const runs = ActiveDockerRuns.fromRunTitles([
      'retry_ubuntu_editor_image_requested',
      ' · Test',
      '',
    ]);

    expect(runs.jobIds.size).toBe(0);
  });
});

describe('ActiveDockerRuns.fetch', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const gitHubWith = (runs: Array<{ status: string; display_title: string }>) => {
    const listWorkflowRunsForRepo = vi.fn();
    return {
      actions: { listWorkflowRunsForRepo },
      paginate: vi.fn(async () => runs),
    };
  };

  it('keeps every unfinished run, whatever its status', async () => {
    const gitHub = gitHubWith([
      { status: 'pending', display_title: 'editor-a-4.0.0 · New Ubuntu Editor Version 🗔' },
      { status: 'queued', display_title: 'editor-b-4.0.0 · New Ubuntu Editor Version 🗔' },
      { status: 'in_progress', display_title: 'editor-c-4.0.0 · New Windows Editor Version 🗔' },
      { status: 'completed', display_title: 'editor-d-4.0.0 · New Ubuntu Editor Version 🗔' },
    ]);

    const runs = await ActiveDockerRuns.fetch(gitHub as any, now);

    expect([...runs.jobIds].toSorted()).toEqual([
      'editor-a-4.0.0',
      'editor-b-4.0.0',
      'editor-c-4.0.0',
    ]);
  });

  it('lists runs by creation time, so a status change mid-sweep cannot hide one', async () => {
    const gitHub = gitHubWith([]);

    await ActiveDockerRuns.fetch(gitHub as any, now);

    expect(gitHub.paginate).toHaveBeenCalledTimes(1);
    const [endpoint, params] = gitHub.paginate.mock.calls[0] as unknown as [unknown, any];
    expect(endpoint).toBe(gitHub.actions.listWorkflowRunsForRepo);
    expect(params.created).toBe('>=2026-11-19T12:00:00.000Z');
    expect(params).not.toHaveProperty('status');
  });
});
