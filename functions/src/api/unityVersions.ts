import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../shared';
import { getUnityVersionInfo } from '../logic/getUnityVersionInfo';

export const unityVersions = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const versionInfo = await getUnityVersionInfo();
      response.send(versionInfo);
    } catch (err) {
      firebase.logger.error(err);
      response.send('Oops.');
    }
  },
);
