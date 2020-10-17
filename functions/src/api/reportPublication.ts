import { firebase, functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../config/discord';

export const reportPublication = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    if (!Token.isValid(req.header('authorization'))) {
      firebase.logger.warn('unauthorised request', req.headers);
      res.status(403).send('Unauthorized');
      return;
    }

    const { body } = req;
    firebase.logger.debug('Publication report incoming.', body);
    const isDryRun = req.body.jobId?.toString().startsWith('dryRun');

    const { jobId, buildId, dockerInfo } = body;
    await CiBuilds.markBuildAsPublished(buildId, dockerInfo);
    const jobHasCompleted = await CiBuilds.haveAllBuildsForJobBeenPublished(jobId);

    if (jobHasCompleted) {
      await CiJobs.markJobAsCompleted(jobId);
      const message = `New images published for ${jobId}.`;
      firebase.logger.info(message);
      if (!isDryRun) {
        await Discord.sendMessageToMaintainers(message);
      }
    }

    firebase.logger.info('Publication reported.', body);
    if (isDryRun) {
      await CiBuilds.removeDryRunBuild(req.body.buildId);
      await CiJobs.removeDryRunJob(req.body.jobId);
    }

    res.status(200).send('OK');
  } catch (err) {
    const message = `
      Something went wrong while wrong while reporting a new publication
      ${err.message}
    `;
    firebase.logger.error(message, err);
    await Discord.sendAlert(message);

    if (req.body?.jobId?.toString().startsWith('dryRun')) {
      await CiBuilds.removeDryRunBuild(req.body.buildId);
      await CiJobs.removeDryRunJob(req.body.jobId);
    }

    res.status(500).send('Something went wrong');
  }
});
