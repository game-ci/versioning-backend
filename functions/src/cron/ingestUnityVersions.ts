import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { scrapeVersionInfoFromUnity } from '../logic/ingest/scrapeVersionInfoFromUnity';
import { Discord } from '../config/discord';
import { updateDatabaseWithNewVersionInformation } from '../logic/ingest/determineNewVersions';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const scrapedInfoList = await scrapeVersionInfoFromUnity();
      await updateDatabaseWithNewVersionInformation(scrapedInfoList);
    } catch (err) {
      const message = `
        Something went wrong while importing new versions from unity:
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

      firebase.logger.error(message);
      await Discord.sendAlert(message);
    } finally {
      await Discord.disconnect();
    }
  });
