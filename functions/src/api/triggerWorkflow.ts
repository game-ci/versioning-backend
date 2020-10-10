import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';

export const triggerWorkflow = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      response.status(200).send('Ok');
    } catch (err) {
      firebase.logger.error(err);
      response.status(500).send('Oops.');
    }
  },
);
