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
  it('collects titles from every unfinished run status', async () => {
    const titlesByStatus: Record<string, string[]> = {
      queued: ['editor-2022.3.26f1-4.0.0 · New Ubuntu Editor Version 🗔'],
      in_progress: ['editor-2022.3.30f1-4.0.0 · New Windows Editor Version 🗔'],
    };
    const listWorkflowRunsForRepo = vi.fn();
    const gitHub = {
      actions: { listWorkflowRunsForRepo },
      paginate: vi.fn(async (_endpoint: unknown, { status }: { status: string }) =>
        (titlesByStatus[status] ?? []).map((display_title) => ({ display_title })),
      ),
    };

    const runs = await ActiveDockerRuns.fetch(gitHub as any);

    expect(ActiveDockerRuns.has(runs, 'editor-2022.3.26f1-4.0.0')).toBe(true);
    expect(ActiveDockerRuns.has(runs, 'editor-2022.3.30f1-4.0.0')).toBe(true);
    const statuses = gitHub.paginate.mock.calls.map(([, params]) => (params as any).status);
    expect(statuses).toEqual(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
    expect(gitHub.paginate.mock.calls[0][0]).toBe(listWorkflowRunsForRepo);
  });
});
