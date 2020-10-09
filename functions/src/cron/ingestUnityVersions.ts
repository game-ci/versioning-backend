import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../config/firebase';
import { getVersionInfoFromUnity } from '../logic/getVersionInfoFromUnity';
import { importNewVersionsFromList } from '../model/versionInfo';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const versionInfo = await getVersionInfoFromUnity();

      await importNewVersionsFromList(versionInfo);

      firebase.logger.info('New versions successfully imported.');
    } catch (err) {
      firebase.logger.error('Something went wrong while importing new versions from unity', err);
    }
  });
