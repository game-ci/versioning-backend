import { firebase, functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { BuildFailure, CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../config/discord';

export const reportBuildFailure = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    if (!Token.isValid(req.header('authorization'))) {
      firebase.logger.warn('unauthorised request', req.headers);
      res.status(403).send('Unauthorized');
      return;
    }

    const { body } = req;
    const { jobId, buildId, reason } = body;
    const failure: BuildFailure = { reason };

    await CiJobs.markFailureForJob(jobId);
    await CiBuilds.markBuildAsFailed(buildId, failure);

    firebase.logger.info('Build failure reported.', body);
    res.status(200).send('OK');
  } catch (err) {
    const message = `
      Something went wrong while wrong while reporting a build failure
      ${err.message} (${err.status})\n${err.stackTrace}
    `;
    firebase.logger.error(message);
    await Discord.sendAlert(message);
    res.status(500).send('Something went wrong');
  }
});
