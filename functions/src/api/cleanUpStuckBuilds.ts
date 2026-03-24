import { admin } from '../service/firebase';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { Cleaner } from '../logic/buildQueue/cleaner';
import { Discord } from '../service/discord';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');
const internalToken = defineSecret('INTERNAL_TOKEN');

/**
 * Endpoint for maintainers to manually clean up stuck builds.
 *
 * Unlike the automated cleaner (which waits 6 hours and processes max 5 builds),
 * this endpoint processes all stuck "started" builds immediately by checking
 * DockerHub for each one and marking them as published or failed accordingly.
 *
 * Auth: accepts either the internal versioning token (for CI workflows) or a
 * Firebase Admin JWT (for the versions page UI).
 *
 * Usage: POST /cleanUpStuckBuilds with Authorization: Bearer <token>
 */
export const cleanUpStuckBuilds = onRequest(
  { secrets: [discordToken, internalToken] },
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

      // Authenticate via internal token (CI) or Firebase Admin JWT (UI)
      const authHeader = request.header('Authorization');
      const isInternalTokenValid = Token.isValid(authHeader, internalToken.value());

      if (!isInternalTokenValid) {
        const bearerToken = authHeader?.replace(/^Bearer\s/, '');
        if (!bearerToken) {
          response.status(401).send({ message: 'Unauthorized' });
          return;
        }
        try {
          const user = await admin.auth().verifyIdToken(bearerToken);
          if (!user || !user.email_verified || !user.admin) {
            response.status(401).send({ message: 'Unauthorized' });
            return;
          }
        } catch {
          response.status(401).send({ message: 'Unauthorized' });
          return;
        }
      }

      logger.info('Manual cleanup triggered');
      const results = await Cleaner.manualCleanUp();
      logger.info('Manual cleanup completed', { resultCount: results.length });

      response.status(200).send({
        message: 'Manual cleanup completed',
        results,
      });
    } catch (error: any) {
      logger.error('cleanUpStuckBuilds error', error);
      response.status(500).send({
        message: 'Internal error during cleanup',
        error: error.message,
      });
    }

    Discord.disconnect();
  },
);
