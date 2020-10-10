import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { scrapeVersionInfoFromUnity } from '../logic/ingest/scrapeVersionInfoFromUnity';
import { UnityVersionInfo } from '../model/unityVersionInfo';
import { generateBuildQueueFromNewVersionInfoList } from '../logic/buildQueue/generateBuildQueueFromNewVersionInfo';
import { determineNewVersions } from '../logic/ingest/determineNewVersions';
import { Discord } from '../config/discord';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const scrapedInfoList = await scrapeVersionInfoFromUnity();
      const newInfoList = await determineNewVersions(scrapedInfoList);

      await UnityVersionInfo.updateMany(scrapedInfoList);
      await generateBuildQueueFromNewVersionInfoList(newInfoList);

      const message = `${scrapedInfoList.length} versions found.`;
      firebase.logger.info(message);

      await Discord.sendMessageToMaintainers(message);
    } catch (err) {
      const message = `
        Something went wrong while importing new versions from unity:
        ${err.maintainers} (${err.status})\n
        ${err.stackTrace}`;

      firebase.logger.error(message);
      await Discord.sendAlert(message);
    } finally {
      await Discord.disconnect();
    }
  });
