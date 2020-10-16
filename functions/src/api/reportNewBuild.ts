import { firebase, functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';

export const reportNewBuild = functions.https.onRequest(async (req: Request, res: Response) => {
  if (!Token.isValid(req.header('Authorisation'))) {
    firebase.logger.warn('unauthorised request', req);
    res.status(403).send('Unauthorized');
    return;
  }

  firebase.logger.info('new build reported', req);

  res.status(200).send('OK');
});
