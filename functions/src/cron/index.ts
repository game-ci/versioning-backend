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

// Timeout of 60 seconds will keep our routine process tight.
export const trigger = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .pubsub.schedule(`every ${MINUTES} minutes`)
  .onRun(async () => {
    try {
      await routineTasks();
    } catch (error) {
      const errorStatus = error.status ? ` (${error.status})` : '';
      const errorStack = error.stackTrace ? `\n${error.stackTrace}` : '';
      const fullError = `${error.message}${errorStatus}${errorStack}`;

      const routineTasksFailedMessage = `Something went wrong while running routine tasks.\n${fullError}`;

      firebase.logger.error(routineTasksFailedMessage);
      await Discord.sendAlert(routineTasksFailedMessage);
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
    await Discord.disconnect();
  }
};
