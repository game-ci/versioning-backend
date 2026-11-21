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

export const UnfinishedWorkflowRuns = {
  jobIdFromRunName: (runName: string): string | null => {
    return runName.trim().match(jobIdInRunName)?.[1] ?? null;
  },

  /**
   * The ids of the jobs that have a workflow run GitHub has not finished
   * (queued, waiting for a runner or running) in the docker repository.
   */
  fetchJobIds: async (gitHub: Octokit): Promise<Set<string>> => {
    const jobIds = new Set<string>();

    for (const status of unfinishedStatuses) {
      const runs = await gitHub.paginate(gitHub.actions.listWorkflowRunsForRepo, {
        ...settings.github.dockerRepository,
        status,
        per_page: 100,
      });

      for (const run of runs) {
        const jobId = UnfinishedWorkflowRuns.jobIdFromRunName(run.display_title);
        if (jobId) jobIds.add(jobId);
      }
    }

    return jobIds;
  },
} as const;
