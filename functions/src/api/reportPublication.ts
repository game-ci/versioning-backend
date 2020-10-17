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
    firebase.logger.debug('Publication report incomfing.', body);

    const { jobId, buildId, dockerInfo } = body;
    await CiBuilds.markBuildAsPublished(buildId, dockerInfo);
    const jobHasCompleted = await CiBuilds.haveAllBuildsForJobBeenPublished(jobId);
    firebase.logger.info('Publication reported.', body);

    if (jobHasCompleted) {
      await CiJobs.markJobAsCompleted(jobId);
      const message = `Job completed for ${jobId}.`;
      firebase.logger.info(message);
      await Discord.sendMessageToMaintainers(message);
    }

    res.status(200).send('OK');
  } catch (err) {
    const message = `
      Something went wrong while wrong while reporting a new publication
      ${err.message} (${err.status})\n${err.stackTrace}
    `;
    firebase.logger.error(message);
    await Discord.sendAlert(message);
    res.status(500).send('Something went wrong');
  }
});
