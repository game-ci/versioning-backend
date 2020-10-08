import { firebase, functions } from '../shared';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';

// Todo - implement bearer token
// https://github.com/firebase/functions-samples/blob/master/authorized-https-endpoint/functions/index.js

export const reportFailure = functions.https.onRequest(
  async (request: Request, response: Response) => {
    // Todo - When builder is unsuccessful: Unlock buildJob from buildQueue

    firebase.logger.info('image build reported back (failure)');
    response.status(200).send('OK');
  },
);

export const reportPublished = functions.https.onRequest(
  async (request: Request, response: Response) => {
    // Todo - When successful: Remove buildJob from buildQueue and add its version to builtVersions

    firebase.logger.info('image build reported back (success)');
    response.status(200).send('OK');
  },
);
