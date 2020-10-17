import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { EditorVersionInfo } from '../model/editorVersionInfo';

export const unityVersions = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const versions = await EditorVersionInfo.getAllIds();

      response.send(versions);
    } catch (err) {
      firebase.logger.error(err);
      response.send('Oops.');
    }
  },
);
