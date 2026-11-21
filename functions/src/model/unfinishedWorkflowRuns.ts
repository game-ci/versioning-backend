import { Octokit } from '@octokit/rest';
import { settings } from '../config/settings';

/**
 * Statuses of a workflow run that GitHub has not finished yet. A dispatched
 * run can stay "queued" for hours while every runner is busy.
 */
const unfinishedStatuses = ['requested', 'queued', 'pending', 'waiting', 'in_progress'] as const;

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

  fetch: async (gitHub: Octokit): Promise<UnfinishedWorkflowRuns> => {
    const jobIds = new Set<string>();
    let unidentifiedDispatches = 0;

    for (const status of unfinishedStatuses) {
      const runs = await gitHub.paginate(gitHub.actions.listWorkflowRunsForRepo, {
        ...settings.github.dockerRepository,
        status,
        per_page: 100,
      });

      for (const run of runs) {
        const jobId = UnfinishedWorkflowRuns.jobIdFromRunName(run.display_title);
        if (jobId) jobIds.add(jobId);
        else if (run.event === 'repository_dispatch') unidentifiedDispatches += 1;
      }
    }

    return { jobIds, unidentifiedDispatches };
  },
} as const;
