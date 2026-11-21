import { Octokit } from '@octokit/rest';

/**
 * The docker repository's workflow runs that have not finished yet, by the job they build.
 *
 * A dispatched job only creates build records once a GitHub runner picks it up, which can
 * take hours when the runners are saturated. Its run exists from the moment of dispatch:
 * every dispatch workflow names its run "<jobId> · <workflow name>".
 */
export type ActiveDockerRuns = {
  readonly jobIds: ReadonlySet<string>;
};

const TITLE_SEPARATOR = ' · ';
const UNFINISHED_STATUSES = ['queued', 'in_progress', 'waiting', 'pending', 'requested'] as const;

const jobIdFromTitle = (title: string): string | null => {
  const separatorAt = title.indexOf(TITLE_SEPARATOR);
  if (separatorAt <= 0) return null;
  return title.slice(0, separatorAt).trim() || null;
};

export const ActiveDockerRuns = {
  none: (): ActiveDockerRuns => ({ jobIds: new Set() }),

  fromRunTitles: (titles: readonly string[]): ActiveDockerRuns => ({
    jobIds: new Set(titles.map(jobIdFromTitle).filter((jobId): jobId is string => jobId !== null)),
  }),

  has: (runs: ActiveDockerRuns, jobId: string): boolean => runs.jobIds.has(jobId),

  fetch: async (gitHub: Octokit): Promise<ActiveDockerRuns> => {
    const titles: string[] = [];
    for (const status of UNFINISHED_STATUSES) {
      const runs = await gitHub.paginate(gitHub.actions.listWorkflowRunsForRepo, {
        owner: 'unity-ci',
        repo: 'docker',
        status,
        per_page: 100,
      });
      titles.push(...runs.map((run) => run.display_title));
    }
    return ActiveDockerRuns.fromRunTitles(titles);
  },
} as const;
