import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from './shared';

export const helloWorld = functions.https.onRequest((request: Request, response: Response) => {
  firebase.logger.info('Hello logs!', { structuredData: true });
  response.send('Unity CI Versioning Backend!');
});
