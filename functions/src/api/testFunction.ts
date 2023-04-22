import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { functions } from '../service/firebase';

export const testFunction = functions.https.onRequest(
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async (request: Request, response: Response) => {},
);
