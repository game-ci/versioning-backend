import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { GitHub } from '../config/github';

export const triggerWorkflow = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const gitHub = await GitHub.init();
      const pulls = await gitHub.pulls.get();
      response.status(200).send(pulls);
    } catch (err) {
      firebase.logger.error(err);
      response.status(500).send('Oops.');
    }
  },
);
