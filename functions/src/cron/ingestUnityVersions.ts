import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { scrapeVersionInfoFromUnity } from '../logic/ingest/scrapeVersionInfoFromUnity';
import { UnityVersionInfo } from '../model/unityVersionInfo';
import { generateBuildQueueFromNewVersionInfoList } from '../logic/buildQueue/generateBuildQueueFromNewVersionInfo';
import { determineNewVersions } from '../logic/ingest/determineNewVersions';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const scrapedInfoList = await scrapeVersionInfoFromUnity();
      const newInfoList = await determineNewVersions(scrapedInfoList);

      await UnityVersionInfo.updateMany(scrapedInfoList);
      await generateBuildQueueFromNewVersionInfoList(newInfoList);

      firebase.logger.info(`${newInfoList.length} new versions were added.`);
    } catch (err) {
      firebase.logger.error('Something went wrong while importing new versions from unity', err);
    }
  });
