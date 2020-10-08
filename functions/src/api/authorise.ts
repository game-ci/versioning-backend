// GitHub  Authorization callback URL
// https://docs.github.com/en/free-pro-team@latest/developers/apps/authorizing-oauth-apps

import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../shared';

export const authorise = functions.https.onRequest((request: Request, response: Response) => {
  firebase.logger.info('authorise was called', { structuredData: true });
  response.status(200).send('OK');
});
