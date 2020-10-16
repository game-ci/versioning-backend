import { functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { ingestUnityVersions } from '../logic/ingestUnityVersions';

/**
 * Starts all routine tasks, based on the scheduled trigger from `cron/trigger`.
 */
export const worker = functions.https.onRequest(async (request: Request, response: Response) => {
  // Immediately response so cron-trigger can finish its execution.
  response.status(200).send('OK');

  // Routine tasks
  await ingestUnityVersions();
});
