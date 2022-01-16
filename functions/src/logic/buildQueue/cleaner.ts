import { CiBuilds } from '../../model/ciBuilds';
import { Discord } from '../../service/discord';
import { Dockerhub } from '../../service/dockerhub';

export class Cleaner {
  public static async cleanUp() {
    await this.cleanUpBuildsThatDidntReportBack();
  }

  public static async cleanUpBuildsThatDidntReportBack() {
    const startedBuilds = await CiBuilds.getStartedBuilds(12);

    for (const startedBuild of startedBuilds) {
      const { buildId, meta, imageType, buildInfo } = startedBuild;
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
        const response = await Dockerhub.fetchImageData(imageType, tag);

        // Image does not exist
        if (!response) {
          const markAsFailedMessage = `[Cleaner] Build for "${tag}" with status "started" never reported back in. Marking as as failed.`;
          await Discord.sendAlert(markAsFailedMessage);
          await CiBuilds.markBuildAsFailed(buildId, { reason: markAsFailedMessage });

          continue;
        }

        // Image exists
        const markAsSuccessfulMessage = `[Cleaner] Build for "${tag}" got stuck. But the image was successfully uploaded. Marking as published`;
        await Discord.sendDebug(markAsSuccessfulMessage);
        await CiBuilds.markBuildAsPublished(buildId, {
          digest: '', // missing
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
