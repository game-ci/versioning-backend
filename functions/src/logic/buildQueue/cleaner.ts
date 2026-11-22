import { CiBuilds } from '../../model/ciBuilds';
import { CiJobs } from '../../model/ciJobs';
import { Discord } from '../../service/discord';
import { Dockerhub } from '../../service/dockerhub';
import { logger } from 'firebase-functions/v2';
import { UnfinishedWorkflowRuns } from '../../model/unfinishedWorkflowRuns';

/** Asks GitHub which workflow runs it has not finished. */
export type FetchUnfinishedRuns = () => Promise<UnfinishedWorkflowRuns>;

/** The unfinished runs, asked of GitHub at most once per pass; null when GitHub could not be asked. */
type UnfinishedRunsThisPass = () => Promise<UnfinishedWorkflowRuns | null>;

export class Cleaner {
  // Cronjob intentionally has a limited runtime, but it still needs enough
  // throughput to drain queue backlogs without requiring manual intervention.
  static readonly maxBuildsProcessedPerRun: number = 25;
  static readonly activeJobWithoutBuildsAfterMinutes: number = 30;
  static readonly startedBuildPublishProbeAfterMinutes: number = 45;
  static readonly startedBuildFailureAfterHours: number = 6;

  static buildsProcessed: number;

  public static async cleanUp(latestRepoVersion: string, fetchUnfinishedRuns: FetchUnfinishedRuns) {
    this.buildsProcessed = 0;
    const unfinishedRuns = this.askGitHubOnceForUnfinishedRuns(fetchUnfinishedRuns);
    await this.requeueActiveJobsWithoutBuilds(unfinishedRuns);
    await this.transitionStaleInProgressJobsToFailed(unfinishedRuns);
    await this.recoverMaxedOutFailedBuilds(latestRepoVersion);
    await this.reconcileStartedBuildsThatMayHavePublished();
    await this.cleanUpBuildsThatDidntReportBack();
    await this.healFailedBuildsAlreadyOnDockerHub();
  }

  /**
   * A build that has been auto-recovered this many times will not be reset
   * again. Beyond this point the build is almost certainly fundamentally
   * broken (e.g. an unbuildable editor version on a given base OS); further
   * resets only burn GitHub Actions minutes and DockerHub API quota.
   */
  static readonly maxRecoveryAttempts: number = 2;

  /**
   * Jobs can get stuck in "scheduled" or "inProgress" without ever creating a
   * build record when the dispatch path flakes before reportNewBuild. Reset
   * those jobs back to created so the scheduler can dispatch them again.
   *
   * A job without build records is usually just waiting for a runner, so it
   * is only reset once GitHub has no queued or running workflow run for it.
   * Resetting a waiting job would dispatch its workflows a second time.
   */
  private static async requeueActiveJobsWithoutBuilds(
    unfinishedRunsThisPass: UnfinishedRunsThisPass,
  ) {
    const activeJobs = await CiJobs.getActiveJobs();
    const staleThresholdMs = this.activeJobWithoutBuildsAfterMinutes * 60 * 1000;
    const staleJobs = [];

    for (const activeJob of activeJobs) {
      const { id: jobId, data: job } = activeJob;
      const lastTouchedSeconds = job.modifiedDate?.seconds || job.addedDate?.seconds;
      if (!lastTouchedSeconds) continue;

      const ageMs = Date.now() - lastTouchedSeconds * 1000;
      if (ageMs < staleThresholdMs) continue;

      const queueBuilds = await CiBuilds.getQueueBuildsForJob(jobId);
      if (queueBuilds.length > 0) continue;

      staleJobs.push(activeJob);
    }

    if (staleJobs.length === 0) return;

    const unfinishedRuns = await unfinishedRunsThisPass();
    if (!unfinishedRuns) return;

    if (unfinishedRuns.unidentifiedDispatches > 0) {
      await Discord.sendDebug(
        `[Cleaner] ${unfinishedRuns.unidentifiedDispatches} queued or running dispatched run(s) cannot be matched to a job. Resetting none of ${staleJobs.length} stale job(s) this pass, as any of them may be waiting on one.`,
      );
      return;
    }

    for (const { id: jobId, data: job } of staleJobs) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      if (unfinishedRuns.jobIds.has(jobId)) {
        logger.info(
          `[Cleaner] Job "${jobId}" has no build records yet; its workflow run is still queued or running.`,
        );
        continue;
      }

      this.buildsProcessed += 1;
      await CiJobs.resetJobToCreated(jobId);
      await Discord.sendAlert(
        `[Cleaner] Reset stale ${job.status} job "${jobId}" back to created because it had no build records from the queue after ${this.activeJobWithoutBuildsAfterMinutes} minutes and no queued or running workflow run.`,
      );
    }
  }

  /**
   * When GitHub cannot be asked, any stale job may still have a run waiting for a runner, so
   * none is reset or failed this pass. The next pass asks again; an outage that lasts is
   * visible in the alerts rather than in duplicate dispatches.
   */
  private static askGitHubOnceForUnfinishedRuns(
    fetchUnfinishedRuns: FetchUnfinishedRuns,
  ): UnfinishedRunsThisPass {
    let answer: Promise<UnfinishedWorkflowRuns | null> | undefined;
    return () => {
      answer ??= fetchUnfinishedRuns().catch(async (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        await Discord.sendAlert(
          `[Cleaner] Could not ask GitHub which jobs have queued or running workflow runs (${reason}). Resetting and failing no stale job this pass.`,
        );
        return null;
      });
      return answer;
    };
  }

  /**
   * An inProgress job whose builds have all finished (none are "started") is
   * stuck — the job will never self-transition because only the build-report
   * path calls markFailureForJob. Move these to "failed" so the Ingeminator
   * can schedule retries and free up queue capacity for fresh jobs.
   *
   * Builds only report once a runner starts them, so a job whose recorded
   * builds failed may still have other platforms queued; it is left alone
   * while GitHub has an unfinished run for it.
   */
  private static async transitionStaleInProgressJobsToFailed(
    unfinishedRunsThisPass: UnfinishedRunsThisPass,
  ) {
    const activeJobs = await CiJobs.getActiveJobs();
    const staleThresholdMs = this.activeJobWithoutBuildsAfterMinutes * 60 * 1000;
    const settledJobs = [];

    for (const activeJob of activeJobs) {
      const { id: jobId, data: job } = activeJob;
      const lastTouchedSeconds = job.modifiedDate?.seconds || job.addedDate?.seconds;
      if (!lastTouchedSeconds) continue;

      const ageMs = Date.now() - lastTouchedSeconds * 1000;
      if (ageMs < staleThresholdMs) continue;

      const queueBuilds = await CiBuilds.getQueueBuildsForJob(jobId);
      if (queueBuilds.length === 0) continue; // handled by requeueActiveJobsWithoutBuilds

      const hasStartedBuilds = queueBuilds.some((build) => build.status === 'started');
      if (hasStartedBuilds) continue; // at least one build is still running

      settledJobs.push(activeJob);
    }

    if (settledJobs.length === 0) return;

    const unfinishedRuns = await unfinishedRunsThisPass();
    if (!unfinishedRuns || unfinishedRuns.unidentifiedDispatches > 0) return;

    for (const { id: jobId, data: job } of settledJobs) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      if (unfinishedRuns.jobIds.has(jobId)) {
        logger.info(
          `[Cleaner] Job "${jobId}" has settled builds but its workflow run is still queued or running.`,
        );
        continue;
      }

      this.buildsProcessed += 1;
      await CiJobs.markFailureForJob(jobId);
      await Discord.sendAlert(
        `[Cleaner] Transitioned ${job.status} job "${jobId}" to failed: all its builds have settled with no started builds remaining.`,
      );
    }
  }

  /**
   * Automatically recover maxed-out failed builds for the latest repo version.
   * If the image is already on DockerHub, mark it as published.
   * Otherwise reset its failure count so the Ingeminator can retry it again.
   *
   * Per run we process at most `maxBuildsProcessedPerRun` builds and we cap
   * the number of times any single build can be auto-reset. Builds that
   * exceed `maxRecoveryAttempts` are left alone and an alert is sent so a
   * maintainer can investigate.
   */
  public static async recoverMaxedOutFailedBuilds(repoVersion: string): Promise<string[]> {
    const results: string[] = [];
    const maxedBuilds = await CiBuilds.getMaxedOutFailedBuildsForRepoVersion(repoVersion);

    let processed = 0;
    for (const { id: buildId, data: build } of maxedBuilds) {
      if (processed >= this.maxBuildsProcessedPerRun) {
        results.push(`deferred:${buildId}`);
        continue;
      }

      const { relatedJobId: jobId, imageType, buildInfo, meta } = build;
      const { baseOs } = buildInfo;
      const tag = buildId.replace(new RegExp(`^${imageType}-`), '');
      const recoveryCount = meta?.recoveryCount ?? 0;

      processed += 1;

      const response = await Dockerhub.fetchImageData(imageType, tag);
      if (response) {
        const digest = response.digest || '';
        await Discord.sendDebug(
          `[Cleaner] Maxed-out build "${tag}" already exists on DockerHub. Marking as published.`,
        );
        await CiBuilds.markBuildAsPublished(buildId, jobId, {
          digest,
          specificTag: `${baseOs}-${repoVersion}`,
          friendlyTag: repoVersion.replace(/\.\d+$/, ''),
          imageName: Dockerhub.getImageName(imageType),
          imageRepo: Dockerhub.getRepositoryBaseName(),
        });
        results.push(`published:${buildId}`);
        continue;
      }

      if (recoveryCount >= this.maxRecoveryAttempts) {
        await Discord.sendAlert(
          `[Cleaner] Build "${tag}" has been auto-recovered ${recoveryCount} time(s) and is still failing. ` +
            `Leaving it at max retries - manual investigation required.`,
        );
        results.push(`exhausted:${buildId}`);
        continue;
      }

      await CiBuilds.resetFailureCount(buildId);
      await CiBuilds.incrementRecoveryCount(buildId);
      await Discord.sendAlert(
        `[Cleaner] Reset failure count for maxed-out build "${tag}" (recovery attempt ${
          recoveryCount + 1
        }/${this.maxRecoveryAttempts}).`,
      );
      results.push(`reset:${buildId}`);
    }

    return results;
  }

  /**
   * Manual cleanup for maintainers. Processes all stuck builds without the
   * 6-hour wait and without the per-run build limit.
   * Returns a summary of actions taken.
   */
  public static async manualCleanUp(): Promise<string[]> {
    const results: string[] = [];
    const startedBuilds = await CiBuilds.getStartedBuilds();

    if (startedBuilds.length === 0) {
      results.push('No stuck builds found.');
      return results;
    }

    results.push(`Found ${startedBuilds.length} build(s) with status "started".`);

    for (const startedBuild of startedBuilds) {
      const { buildId, relatedJobId: jobId, imageType, buildInfo, reconciliation } = startedBuild;
      const { baseOs, repoVersion } = buildInfo;

      const tag = buildId.replace(new RegExp(`^${imageType}-`), '');

      const response = await Dockerhub.fetchImageData(imageType, tag);

      if (!response) {
        results.push(
          `[FAILED] "${tag}" not found on DockerHub. Marking as failed for automatic retry.`,
        );
        await Discord.sendAlert(
          `[ManualCleanup] Build for "${tag}" not on DockerHub. Marking as failed.`,
        );
        await CiBuilds.markBuildAsFailed(buildId, {
          reason: `[ManualCleanup] Build never reported back and image not found on DockerHub.`,
        });
        await CiJobs.recordBuildFailure(jobId, reconciliation);
        continue;
      }

      const digest = response.digest || '';
      results.push(
        `[PUBLISHED] "${tag}" found on DockerHub (digest: ${
          digest || 'n/a'
        }). Marking as published.`,
      );
      await Discord.sendDebug(
        `[ManualCleanup] Build for "${tag}" found on DockerHub. Marking as published.`,
      );
      await CiBuilds.markBuildAsPublished(buildId, jobId, {
        digest,
        specificTag: `${baseOs}-${repoVersion}`,
        friendlyTag: repoVersion.replace(/\.\d+$/, ''),
        imageName: Dockerhub.getImageName(imageType),
        imageRepo: Dockerhub.getRepositoryBaseName(),
      });
    }

    return results;
  }

  /**
   * Reconcile "failed" builds against DockerHub.
   * A build can end up "failed" in Firestore while the image was actually
   * pushed to DockerHub (e.g. the workflow pushed the image but crashed
   * before reporting publication). Mark these as published so the
   * Ingeminator stops retrying them.
   */
  private static async healFailedBuildsAlreadyOnDockerHub() {
    const failedBuilds = await CiBuilds.getFailedBuilds(this.maxBuildsProcessedPerRun);

    for (const failedBuild of failedBuilds) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      const { buildId, relatedJobId: jobId, imageType, buildInfo } = failedBuild;
      const { baseOs, repoVersion } = buildInfo;
      const tag = buildId.replace(new RegExp(`^${imageType}-`), '');

      this.buildsProcessed += 1;

      const response = await Dockerhub.fetchImageData(imageType, tag);
      if (!response) continue;

      const digest = response.digest || '';
      await Discord.sendDebug(
        `[Cleaner] Build "${tag}" is "failed" but exists on DockerHub. Marking as published.`,
      );
      await CiBuilds.markBuildAsPublished(buildId, jobId, {
        digest,
        specificTag: `${baseOs}-${repoVersion}`,
        friendlyTag: repoVersion.replace(/\.\d+$/, ''),
        imageName: Dockerhub.getImageName(imageType),
        imageRepo: Dockerhub.getRepositoryBaseName(),
      });
    }
  }

  /**
   * If a started build has been running for a while and the image already
   * exists on DockerHub, we can mark it as published without waiting for the
   * full GitHub Actions timeout window. This frees queue capacity earlier.
   */
  private static async reconcileStartedBuildsThatMayHavePublished() {
    const startedBuilds = await CiBuilds.getStartedBuilds();
    const probeThresholdMs = this.startedBuildPublishProbeAfterMinutes * 60 * 1000;

    for (const startedBuild of startedBuilds) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      const { buildId, meta, relatedJobId: jobId, imageType, buildInfo } = startedBuild;
      const { lastBuildStart, publishedDate } = meta;
      const { baseOs, repoVersion } = buildInfo;

      if (!lastBuildStart) continue;

      const buildStartMs = new Date(lastBuildStart.seconds * 1000).getTime();
      const nowMs = Date.now();
      if (nowMs - buildStartMs < probeThresholdMs) continue;

      const tag = buildId.replace(new RegExp(`^${imageType}-`), '');
      this.buildsProcessed += 1;

      const response = await Dockerhub.fetchImageData(imageType, tag);
      if (!response) continue;

      const digest = response.digest || '';
      const message = publishedDate
        ? `[Cleaner] Build "${tag}" has published metadata and exists on DockerHub. Reconciling status back to published.`
        : `[Cleaner] Build "${tag}" is still "started" but already exists on DockerHub. Marking as published early.`;
      await Discord.sendDebug(message);
      await CiBuilds.markBuildAsPublished(buildId, jobId, {
        digest,
        specificTag: `${baseOs}-${repoVersion}`,
        friendlyTag: repoVersion.replace(/\.\d+$/, ''),
        imageName: Dockerhub.getImageName(imageType),
        imageRepo: Dockerhub.getRepositoryBaseName(),
      });
    }
  }

  private static async cleanUpBuildsThatDidntReportBack() {
    const startedBuilds = await CiBuilds.getStartedBuilds();

    for (const startedBuild of startedBuilds) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      const {
        buildId,
        meta,
        relatedJobId: jobId,
        imageType,
        buildInfo,
        reconciliation,
      } = startedBuild;
      const { publishedDate, lastBuildStart } = meta;
      const { baseOs, repoVersion } = buildInfo;

      const tag = buildId.replace(new RegExp(`^${imageType}-`), '');

      if (publishedDate) {
        const buildWasPublishedAlreadyMessage = `[Cleaner] Build "${tag}" has a publication date, but it's status is "started". Was a rebuild requested for this build?`;
        await Discord.sendDebug(buildWasPublishedAlreadyMessage);

        // Maybe set status to published. However, that will increase complexity.
        // Deleting a tag from dockerhub and rebuilding will yield this error currently.
        // If we set it to published, we also need to look up the build digest from dockerhub.

        continue;
      }

      if (!lastBuildStart) {
        // In theory this should never happen.
        await Discord.sendAlert(
          `[Cleaner] Build "${tag}" with status "started" does not have a "lastBuildStart" date.`,
        );
        continue;
      }

      // Job execution time - Each job in a workflow can run for up to 6 hours of execution time.
      // If a job reaches this limit, the job is terminated and fails to complete.
      // @see https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration
      const ONE_HOUR = 1000 * 60 * 60;
      const failureThresholdMs = this.startedBuildFailureAfterHours * ONE_HOUR;
      const sixHoursAgo = new Date().getTime() - failureThresholdMs;
      const buildStart = new Date(lastBuildStart.seconds * 1000).getTime();

      if (buildStart < sixHoursAgo) {
        this.buildsProcessed += 1;

        const response = await Dockerhub.fetchImageData(imageType, tag);

        // Image does not exist
        if (!response) {
          const markAsFailedMessage = `[Cleaner] Build for "${tag}" with status "started" never reported back in. Marking it as failed. It will retry automatically.`;
          await Discord.sendAlert(markAsFailedMessage);
          await CiBuilds.markBuildAsFailed(buildId, {
            reason: markAsFailedMessage,
          });
          await CiJobs.recordBuildFailure(jobId, reconciliation);

          continue;
        }

        // Image exists
        const digest = response.digest || '';
        const markAsSuccessfulMessage = `[Cleaner] Build for "${tag}" got stuck. But the image was successfully uploaded. Marking it as published.`;
        await Discord.sendDebug(markAsSuccessfulMessage);
        await CiBuilds.markBuildAsPublished(buildId, jobId, {
          digest,
          specificTag: `${baseOs}-${repoVersion}`,
          friendlyTag: repoVersion.replace(/\.\d+$/, ''),
          imageName: Dockerhub.getImageName(imageType),
          imageRepo: Dockerhub.getRepositoryBaseName(),
        });

        continue;
      }
    }
  }
}
