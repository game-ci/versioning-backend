import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { db, firebase, functions } from '../config/firebase';
import { VersionInfo } from '../model/versionInfo';

export const unityVersions = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const snapshot = await db.collection('unityVersions').orderBy('version', 'desc').get();
      const versionsInfoList = snapshot.docs.map((doc) => doc.data()) as VersionInfo[];

      const versions = versionsInfoList.map((versionInfo) => versionInfo.version);

      response.send(versions);
    } catch (err) {
      firebase.logger.error(err);
      response.send('Oops.');
    }
  },
);
