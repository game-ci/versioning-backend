import { onRequest, Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { BuildFailure, CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../service/discord';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');
const internalToken = defineSecret('INTERNAL_TOKEN');

export const reportBuildFailure = onRequest(
  { secrets: [discordToken, internalToken] },
  async (req: Request, res: Response) => {
    const discordClient = new Discord();
    await discordClient.init(discordToken.value());

    try {
      if (!Token.isValid(req.header('authorization'), internalToken.value())) {
        logger.warn('unauthorised request', req.headers);
        res.status(403).send('Unauthorized');
        return;
      }

      const { body } = req;
      logger.debug('Build failure report incoming.', body);

      const { jobId, buildId, reason } = body;
      const failure: BuildFailure = { reason };

      await CiJobs.markFailureForJob(jobId);
      await CiBuilds.markBuildAsFailed(buildId, failure);

      logger.info('Build failure reported.', body);
      res.status(200).send('OK');
    } catch (err: any) {
      const message = `
      Something went wrong while reporting a build failure
      ${err.message}
    `;
      logger.error(message, err);

      await discordClient.sendAlert(message);

      if (req.body?.jobId?.toString().startsWith('dryRun')) {
        await CiBuilds.removeDryRunBuild(req.body.buildId);
        await CiJobs.removeDryRunJob(req.body.jobId);
      }

      res.status(500).send('Something went wrong');
    }

    await discordClient.disconnect();
  },
);
