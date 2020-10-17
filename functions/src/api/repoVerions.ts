import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { RepoVersionInfo } from '../model/repoVersionInfo';

export const repoVersions = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const versions = await RepoVersionInfo.getAllIds();

      response.send(versions);
    } catch (err) {
      firebase.logger.error(err);
      response.send('Oops.');
    }
  },
);
