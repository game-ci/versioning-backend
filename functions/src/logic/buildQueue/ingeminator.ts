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
      throw new Error('Expected ingeminator to be called with jobs to retry, none were given');
    }

    for (const job of jobs) {
      if (job.data.imageType !== 'editor') {
        throw new Error('Did not expect to be handling non-editor image type rescheduling');
      }

      await this.rescheduleFailedBuildsForJob(job);
    }
  }

  private async rescheduleFailedBuildsForJob(job: CiJobQueueItem) {
    const { id: jobId, data: jobData } = job;
    const builds = await CiBuilds.getFailedBuildsQueue(jobId);
    if (builds.length <= 0) {
      throw new Error(`Expected failed job with id \`${jobId}\` to have failed builds attached`);
    }

    for (const build of builds) {
      // Space for more?
      if (this.numberToSchedule <= 0) {
        firebase.logger.debug(`waiting for more spots to become available for builds of ${jobId}`);
        return;
      }

      // Incremental back off
      const { lastBuildFailure, failureCount } = build.data.meta;
      const lastFailure = lastBuildFailure as Timestamp;
      const backOffMinutes = failureCount * 15;
      const backOffMilliseconds = backOffMinutes * 60 * 1000;
      if (lastFailure.toMillis() + backOffMilliseconds >= Timestamp.now().toMillis()) {
        firebase.logger.debug(
          `Back off period of ${backOffMinutes} minutes has not expired for ${build.id}`,
        );
        continue;
      }

      // Schedule a build
      this.numberToSchedule -= 1;
      const { id: buildId, data: BuildData } = build;
      if (!(await this.rescheduleBuild(jobId, jobData, buildId, BuildData))) {
        return;
      }
    }

    await CiJobs.markJobAsScheduled(jobId);
    firebase.logger.debug(`rescheduled all editor image build for ${jobId}`);
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
      const failureMessage = `failed to schedule job ${jobId}, status: ${response.status}, response: ${response.data}`;
      firebase.logger.error(failureMessage);
      await Discord.sendAlert(failureMessage);
      return false;
    }

    return true;
  }
}
