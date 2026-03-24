import { admin } from '../service/firebase';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { Cleaner } from '../logic/buildQueue/cleaner';
import { Discord } from '../service/discord';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');

/**
 * Admin-only endpoint for maintainers to manually clean up stuck builds.
 *
 * Unlike the automated cleaner (which waits 6 hours and processes max 5 builds),
 * this endpoint processes all stuck "started" builds immediately by checking
 * DockerHub for each one and marking them as published or failed accordingly.
 *
 * Usage: POST /cleanUpStuckBuilds with Authorization: Bearer <admin-token>
 */
export const cleanUpStuckBuilds = onRequest(
  { secrets: [discordToken] },
  async (request: Request, response: Response) => {
    await Discord.initSafely(discordToken.value());

    try {
      response.set('Content-Type', 'application/json');

      // Allow pre-flight from cross origin
      response.set('Access-Control-Allow-Origin', '*');
      response.set('Access-Control-Allow-Methods', ['POST']);
      response.set('Access-Control-Allow-Headers', ['Content-Type', 'Authorization']);
      if (request.method === 'OPTIONS') {
        response.status(204).send({ message: 'OK' });
        return;
      }

      // User must be authenticated
      const token = request.header('Authorization')?.replace(/^Bearer\s/, '');
      if (!token) {
        response.status(401).send({ message: 'Unauthorized' });
        return;
      }

      // User must be an admin
      const user = await admin.auth().verifyIdToken(token);
      if (!user || !user.email_verified || !user.admin) {
        response.status(401).send({ message: 'Unauthorized' });
        return;
      }

      const results = await Cleaner.manualCleanUp();

      response.status(200).send({
        message: 'Manual cleanup completed',
        results,
      });
    } catch (error: any) {
      console.error('cleanUpStuckBuilds error', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      response.status(500).send({
        message: 'Internal error during cleanup',
        error: error.message,
      });
    }

    Discord.disconnect();
  },
);
