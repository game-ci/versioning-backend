import { Octokit } from '@octokit/rest';
import { settings } from '../config/settings';

/**
 * GitHub drops a job queued for 24 hours and stops one after 6 hours of running, so every
 * unfinished run was created within this window, even one queued for hours behind busy runners.
 */
const unfinishedRunMaxAgeMs = 48 * 60 * 60 * 1000;

/**
 * Dispatched workflows name each run after the job it builds, in trailing
 * brackets: "New Ubuntu Editor Version 🗔 [editor-2022.3.42f1-4.0.0]".
 */
const jobIdInRunName = /\[([^\]\s]+)\]$/;

/** The workflow runs in the docker repository that GitHub has not finished. */
export type UnfinishedWorkflowRuns = {
  /** Jobs that have at least one queued, waiting or running workflow run. */
  readonly jobIds: ReadonlySet<string>;
  /** Dispatched runs whose name does not say which job they build. */
  readonly unidentifiedDispatches: number;
};

export const UnfinishedWorkflowRuns = {
  jobIdFromRunName: (runName: string): string | null => {
    return runName.trim().match(jobIdInRunName)?.[1] ?? null;
  },

  /**
   * Lists runs by creation time, which never changes, rather than by status, which can change
   * between queries: a run moving from pending to queued mid-sweep stays visible.
   */
  fetch: async (gitHub: Octokit, now: number = Date.now()): Promise<UnfinishedWorkflowRuns> => {
    const jobIds = new Set<string>();
    let unidentifiedDispatches = 0;

    const runs = await gitHub.paginate(gitHub.actions.listWorkflowRunsForRepo, {
      ...settings.github.dockerRepository,
      created: `>=${new Date(now - unfinishedRunMaxAgeMs).toISOString()}`,
      per_page: 100,
    });

    for (const run of runs) {
      if (run.status === 'completed') continue;
      const jobId = UnfinishedWorkflowRuns.jobIdFromRunName(run.display_title);
      if (jobId) jobIds.add(jobId);
      else if (run.event === 'repository_dispatch') unidentifiedDispatches += 1;
    }

    return { jobIds, unidentifiedDispatches };
  },
} as const;
