import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { Discord } from '../config/discord';
import { ingestUnityVersions } from '../logic/ingestUnityVersions';
import { ingestRepoVersions } from '../logic/ingestRepoVersions';

/**
 * CPU-time for pubSub is not part of the free quota, so we'll keep it light weight.
 * This will call the cloud function `cron/worker`, using an authentication token.
 */
export const trigger = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context: EventContext) => {
    try {
      await routineTasks();
    } catch (err) {
      const message = `
        Something went wrong while wrong while running routine tasks.
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

      firebase.logger.error(message);
      await Discord.sendAlert(message);
    }
  });

const routineTasks = async () => {
  await ingestRepoVersions();
  await ingestUnityVersions();
};
