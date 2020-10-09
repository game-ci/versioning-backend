import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { UnityVersionInfo } from '../model/unityVersionInfo';

export const unityVersions = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const versionsInfoList = await UnityVersionInfo.getAll();

      const versions = versionsInfoList.map((versionInfo) => versionInfo.version);

      response.send(versions);
    } catch (err) {
      firebase.logger.error(err);
      response.send('Oops.');
    }
  },
);