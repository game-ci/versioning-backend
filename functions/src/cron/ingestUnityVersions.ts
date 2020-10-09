import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { getVersionInfoFromUnity } from '../logic/getVersionInfoFromUnity';
import { getVersionInfoList, updateVersionInfoFromList, VersionInfo } from '../model/versionInfo';
import { generateBuildQueueFromNewVersionInfoList } from '../logic/generateBuildQueueFromNewVersionInfo';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const scrapedInfoList = await getVersionInfoFromUnity();
      const currentInfoList = await getVersionInfoList();
      const currentVersions = currentInfoList.map((currentInfo) => currentInfo.version);

      const newInfoList: VersionInfo[] = [];
      scrapedInfoList.forEach((scrapedInfo) => {
        if (!currentVersions.includes(scrapedInfo.version)) {
          newInfoList.push(scrapedInfo);
        }
      });

      await updateVersionInfoFromList(scrapedInfoList);
      firebase.logger.info('Version information was successfully updated.');

      if (newInfoList.length <= 0) {
        firebase.logger.info('No new versions were added.');
        return;
      }

      await generateBuildQueueFromNewVersionInfoList(newInfoList);
      firebase.logger.info('New versions were added to the build queue.');
    } catch (err) {
      firebase.logger.error('Something went wrong while importing new versions from unity', err);
    }
  });
