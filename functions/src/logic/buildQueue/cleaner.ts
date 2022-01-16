import { CiBuilds } from '../../model/ciBuilds';
import admin from 'firebase-admin';
import Timestamp = admin.firestore.Timestamp;
import { Discord } from '../../service/discord';
import { Dockerhub } from '../../service/dockerhub';

export class Cleaner {
  public static async cleanUp() {
    await this.cleanUpBuildsThatDidntReportBack();
  }

  public static async cleanUpBuildsThatDidntReportBack() {
    const startedBuilds = await CiBuilds.getStartedBuilds();

    for (const startedBuild of startedBuilds) {
      const { buildId, meta, imageType } = startedBuild;
      const { publishedDate, lastBuildStart } = meta;

      if (publishedDate) {
        await Discord.sendDebug(
          `[Cleaner] Build "${buildId}" has a publication date, but it's status is "started".
          Was a rebuild requested for this build?`,
        );

        // Maybe set status to published. However, that will increase complexity.
        // Deleting a tag from dockerhub and rebuilding will this error currently.
        // If we set it to published, we also need to look up the build digest from dockerhub.

        continue;
      }

      if (!lastBuildStart) {
        // In theory this should never happen.
        await Discord.sendAlert(
          `[Cleaner] Build "${buildId}" with status "started" does not have a "lastBuildStart" date.`,
        );
        continue;
      }

      // Job execution time - Each job in a workflow can run for up to 6 hours of execution time.
      // If a job reaches this limit, the job is terminated and fails to complete.
      // @see https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration
      const ONE_HOUR = 1000 * 60 * 60;
      const sixHoursAgo = new Date().getTime() - 6 * ONE_HOUR;

      const { seconds, nanoseconds } = lastBuildStart;
      const buildStart = new Timestamp(seconds, nanoseconds).toDate().getTime();

      if (buildStart < sixHoursAgo) {
        const image = Dockerhub.fetchImageData(imageType, buildId);
        if (!image) {
          await Discord.sendDebug(
            `[Debug] image for "started" build "${buildId}" not found, would set it to failed`,
          );

          // await Discord.sendAlert(
          //   `[Cleaner] Build "${buildId}" with status "started" never reported back in. Marking as as failed.`,
          // );
          // await CiBuilds.markBuildAsFailed(buildId, { reason: 'Runner timed out or failed to report back.' });
          continue;
        }

        await Discord.sendDebug(`[Debug] image "started" build  "${buildId}" found, would set it to published
          using the following data: ${JSON.stringify(image, null, 2)}.`);

        // await CiBuilds.markBuildAsPublished(buildId, {
        //   // imageRepo: string;
        //   // imageName: string;
        //   // friendlyTag: string;
        //   // specificTag: string;
        //   // digest: string;
        // })

        continue;
      }
    }
  }
}
