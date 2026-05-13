import { CiBuilds } from '../../model/ciBuilds';
import { Discord } from '../../service/discord';
import { Dockerhub } from '../../service/dockerhub';

export class Cleaner {
  // Cronjob intentionally has a limited runtime
  static readonly maxBuildsProcessedPerRun: number = 5;

  static buildsProcessed: number;

  public static async cleanUp() {
    this.buildsProcessed = 0;
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
      const { buildId, relatedJobId: jobId, imageType, buildInfo } = startedBuild;
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

  private static async cleanUpBuildsThatDidntReportBack() {
    const startedBuilds = await CiBuilds.getStartedBuilds();

    for (const startedBuild of startedBuilds) {
      if (this.buildsProcessed >= this.maxBuildsProcessedPerRun) return;

      const { buildId, meta, relatedJobId: jobId, imageType, buildInfo } = startedBuild;
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
      const sixHoursAgo = new Date().getTime() - 6 * ONE_HOUR;
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
