import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { Discord } from '../config/discord';
import { Internal } from '../config/internal';

/**
 * CPU-time for pubSub is not part of the free quota, so we'll keep it light weight.
 * This will call the cloud function `cron/worker`, using an authentication token.
 */
export const trigger = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context: EventContext) => {
    try {
      // Just trigger the worker and that's it.
      await Internal.post('cron-worker', {});
    } catch (err) {
      const message = `
        Something went wrong while wrong while calling the cronWorker from pubsub.
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

      firebase.logger.error(message);
      await Discord.sendAlert(message);
    } finally {
      await Discord.disconnect();
    }
  });
