import { admin } from '../service/firebase';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { CiBuilds } from '../model/ciBuilds';
import { Discord } from '../service/discord';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');
const internalToken = defineSecret('INTERNAL_TOKEN');

/**
 * Reset failure counts on failed builds so the Ingeminator can retry them.
 *
 * - With `{ buildId }` in the body: resets a single build.
 * - Without a body: resets ALL failed builds that have hit maxFailuresPerBuild.
 *
 * Auth: accepts either the internal versioning token (for CI workflows) or a
 * Firebase Admin JWT (for the versions page UI).
 *
 * Usage: POST /resetFailedBuilds with Authorization: Bearer <token>
 */
export const resetFailedBuilds = onRequest(
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

      const results: string[] = [];
      const { buildId } = request.body || {};

      if (buildId) {
        // Single build reset
        const build = await CiBuilds.get(buildId);
        if (!build) {
          response.status(404).send({ message: `Build "${buildId}" not found` });
          return;
        }
        if (build.status !== 'failed') {
          response.status(400).send({
            message: `Build "${buildId}" has status "${build.status}", expected "failed"`,
          });
          return;
        }
        await CiBuilds.resetFailureCount(buildId);
        const msg = `Reset failure count for "${buildId}" (was ${build.meta?.failureCount ?? 0}).`;
        results.push(msg);
        logger.info(msg);
        await Discord.sendDebug(`[ResetFailedBuilds] ${msg}`);
      } else {
        // Bulk reset of all maxed-out builds
        const maxedBuilds = await CiBuilds.getMaxedOutFailedBuilds();

        if (maxedBuilds.length === 0) {
          results.push('No failed builds at max retries found.');
        } else {
          results.push(`Found ${maxedBuilds.length} build(s) at max retries.`);
          for (const { id, data } of maxedBuilds) {
            await CiBuilds.resetFailureCount(id);
            const msg = `Reset "${id}" (was ${data.meta?.failureCount ?? 0} failures).`;
            results.push(msg);
          }
          const summary = `[ResetFailedBuilds] Reset failure counts for ${maxedBuilds.length} build(s).`;
          logger.info(summary);
          await Discord.sendDebug(summary);
        }
      }

      response.status(200).send({ message: 'Reset completed', results });
    } catch (error: any) {
      logger.error('resetFailedBuilds error', error);
      response.status(500).send({
        message: 'Internal error during reset',
        error: error.message,
      });
    }

    Discord.disconnect();
  },
);
