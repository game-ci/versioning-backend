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
// GitHub drops jobs queued for 24 hours and stops jobs after 6, so every unfinished run is younger.
const UNFINISHED_RUN_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

  /**
   * Lists runs by creation time, which never changes, rather than by status, which can change
   * between queries; a run that moves from pending to queued mid-sweep stays visible.
   */
  fetch: async (gitHub: Octokit, now: number = Date.now()): Promise<ActiveDockerRuns> => {
    const since = new Date(now - UNFINISHED_RUN_MAX_AGE_MS).toISOString();
    const runs = await gitHub.paginate(gitHub.actions.listWorkflowRunsForRepo, {
      owner: 'unity-ci',
      repo: 'docker',
      created: `>=${since}`,
      per_page: 100,
    });
    return ActiveDockerRuns.fromRunTitles(
      runs.filter((run) => run.status !== 'completed').map((run) => run.display_title),
    );
  },
} as const;
