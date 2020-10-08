import { EventContext } from 'firebase-functions';
import { firebase, functions } from '../shared';
import { getUnityVersionInfo } from '../logic/getUnityVersionInfo';

export const ingestUnityVersions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context: EventContext) => {
    try {
      const versionInfo = await getUnityVersionInfo();

      // Todo - ingest in db

      firebase.logger.info(versionInfo);
    } catch (err) {
      firebase.logger.error(err);
    }
  });
