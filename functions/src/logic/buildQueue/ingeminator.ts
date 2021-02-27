import { CiJob, CiJobQueue, CiJobs, CiJobQueueItem } from '../../model/ciJobs';
import { CiBuild, CiBuilds } from '../../model/ciBuilds';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';
import { Octokit } from '@octokit/rest';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { Scheduler } from './scheduler';
import admin from 'firebase-admin';
import Timestamp = admin.firestore.Timestamp;
import { settings } from '../../config/settings';

export class Ingeminator {
  numberToSchedule: number;
  gitHubClient: Octokit;
  repoVersionInfo: RepoVersionInfo;

  constructor(numberToSchedule: number, gitHubClient: Octokit, repoVersionInfo: RepoVersionInfo) {
    this.numberToSchedule = numberToSchedule;
    this.gitHubClient = gitHubClient;
    this.repoVersionInfo = repoVersionInfo;
  }

  async rescheduleFailedJobs(jobs: CiJobQueue) {
    if (jobs.length <= 0) {
      throw new Error(
        '[Ingeminator] Expected ingeminator to be called with jobs to retry, none were given.',
      );
    }

    for (const job of jobs) {
      if (job.data.imageType !== 'editor') {
        throw new Error(
          '[Ingeminator] Did not expect to be handling non-editor image type rescheduling.',
        );
      }

      await this.rescheduleFailedBuildsForJob(job);
    }
  }

  private async rescheduleFailedBuildsForJob(job: CiJobQueueItem) {
    const { id: jobId, data: jobData } = job;
    const builds = await CiBuilds.getFailedBuildsQueue(jobId);
    if (builds.length <= 0) {
      firebase.logger.info(
        `[Ingeminator] Looks like all failed builds for job \`${jobId}\` are already scheduled.`,
      );
      return;
    }

    for (const build of builds) {
      const { id: buildId, data: BuildData } = build;

      // Space for more?
      if (this.numberToSchedule <= 0) {
        firebase.logger.debug(
          `[Ingeminator] waiting for more spots to become available for builds of ${jobId}.`,
        );
        return;
      }

      // Max retries check
      const { maxFailuresPerBuild } = settings;
      const { lastBuildFailure, failureCount } = build.data.meta;
      const lastFailure = lastBuildFailure as Timestamp;
      if (failureCount >= maxFailuresPerBuild) {
        // Log warning
        const retries: number = maxFailuresPerBuild - 1;
        const maxRetriesReachedMessage =
          `[Ingeminator] Reached the maximum amount of retries (${retries}) for ${buildId}.` +
          `Manual action is now required. Visit https://console.firebase.google.com/u/0/project/unity-ci-versions/firestore/data~2FciBuilds~2F${buildId}`;
        firebase.logger.warn(maxRetriesReachedMessage);

        // Only send alert to discord once
        const alertingPeriodMinutes = settings.minutesBetweenScans;
        const alertingPeriodMilliseconds = alertingPeriodMinutes * 60 * 1000;
        if (lastFailure.toMillis() + alertingPeriodMilliseconds >= Timestamp.now().toMillis()) {
          await Discord.sendAlert(maxRetriesReachedMessage);
        }

        return;
      }

      // Incremental backoff
      const backoffMinutes = failureCount * 15;
      const backoffMilliseconds = backoffMinutes * 60 * 1000;
      if (lastFailure.toMillis() + backoffMilliseconds >= Timestamp.now().toMillis()) {
        firebase.logger.debug(
          `[Ingeminator] Backoff period of ${backoffMinutes} minutes has not expired for ${buildId}.`,
        );
        continue;
      }

      // Schedule a build
      this.numberToSchedule -= 1;
      if (!(await this.rescheduleBuild(jobId, jobData, buildId, BuildData))) {
        return;
      }
    }

    await CiJobs.markJobAsScheduled(jobId);
    firebase.logger.debug(`[Ingeminator] rescheduled any failing editor images for ${jobId}.`);
  }

  private async rescheduleBuild(
    jobId: string,
    jobData: CiJob,
    buildId: string,
    buildData: CiBuild,
  ) {
    // Info from job
    const { editorVersionInfo } = jobData;
    const { version: editorVersion, changeSet } = editorVersionInfo as EditorVersionInfo;

    // Info from build
    const { buildInfo } = buildData;
    const { baseOs, targetPlatform } = buildInfo;

    // Info from repo
    const repoVersions = Scheduler.parseRepoVersions(this.repoVersionInfo);
    const { repoVersionFull, repoVersionMinor, repoVersionMajor } = repoVersions;

    // Send the retry request
    const response = await this.gitHubClient.repos.createDispatchEvent({
      owner: 'unity-ci',
      repo: 'docker',
      event_type: 'retry_editor_image_requested',
      client_payload: {
        jobId,
        buildId,
        editorVersion,
        changeSet,
        baseOs, // specific to retry jobs
        targetPlatform, // specific to retry jobs
        repoVersionFull,
        repoVersionMinor,
        repoVersionMajor,
      },
    });

    if (response.status <= 199 || response.status >= 300) {
      const failureMessage = `
        [Ingeminator] failed to ingeminate job ${jobId},
        status: ${response.status}, response: ${response.data}.`;
      firebase.logger.error(failureMessage);
      await Discord.sendAlert(failureMessage);
      return false;
    }

    return true;
  }
}
