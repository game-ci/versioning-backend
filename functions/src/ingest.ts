import { Request } from 'firebase-functions/lib/providers/https';
import { EventContext } from 'firebase-functions';
import { getUnityVersionInfo } from './logic/getUnityVersionInfo';
import { firebase, functions } from './shared';

export const intoBrowser = functions.https.onRequest(async (request: Request, response: any) => {
  try {
    const versionInfo = await getUnityVersionInfo();
    response.send(versionInfo);
  } catch (err) {
    firebase.logger.error(err);
    response.send('Oops.');
  }
});

export const intoDb = functions.pubsub
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
