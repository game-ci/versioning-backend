import { Request } from 'firebase-functions/lib/providers/https';
import { firebase, functions } from './shared';

export const helloWorld = functions.https.onRequest((request: Request, response: any) => {
  firebase.logger.info('Hello logs!', { structuredData: true });
  response.send('Unity CI Versioning Backend!');
});
