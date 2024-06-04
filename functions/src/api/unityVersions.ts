import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { EditorVersionInfo } from '../model/editorVersionInfo';
import { logger } from 'firebase-functions/v2';

export const unityVersions = onRequest(async (request: Request, response: Response) => {
  try {
    const versions = await EditorVersionInfo.getAllIds();

    response.send(versions);
  } catch (err) {
    logger.error(err);
    response.send('Oops.');
  }
});
