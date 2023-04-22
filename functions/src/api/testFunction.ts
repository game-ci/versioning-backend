import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { functions } from '../service/firebase';

export const testFunction = functions.https.onRequest(
  async (request: Request, response: Response) => {},
);
