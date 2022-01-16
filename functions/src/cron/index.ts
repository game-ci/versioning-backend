import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../service/firebase';
import { Discord } from '../service/discord';
import { ingestUnityVersions } from '../logic/ingestUnityVersions';
import { ingestRepoVersions } from '../logic/ingestRepoVersions';
import { cleanUpBuilds, scheduleBuildsFromTheQueue } from '../logic/buildQueue';
import { settings } from '../config/settings';

const MINUTES: number = settings.minutesBetweenScans;
if (MINUTES < 10) {
  throw new Error('Is the result really worth the machine time? Remove me.');
}

/**
 * CPU-time for pubSub is not part of the free quota, so we'll keep it light weight.
 * This will call the cloud function `cron/worker`, using an authentication token.
 */
export const trigger = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .pubsub.schedule(`every ${MINUTES} minutes`)
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
  try {
    await Discord.sendDebugLine('begin');
    await ingestRepoVersions();
    await ingestUnityVersions();
    await cleanUpBuilds();
    await scheduleBuildsFromTheQueue();
  } catch (error) {
    firebase.logger.error(error);
    await Discord.sendAlert(error);
  } finally {
    await Discord.sendDebugLine('end');
  }
};
