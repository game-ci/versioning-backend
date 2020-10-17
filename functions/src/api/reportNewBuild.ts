import { firebase, functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { BuildInfo, CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../config/discord';

export const reportNewBuild = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    if (!Token.isValid(req.header('Authorisation'))) {
      firebase.logger.warn('unauthorised request', req);
      res.status(403).send('Unauthorized');
      return;
    }

    const { body } = req;
    const { buildId, jobId, imageType, baseOs, repoVersion, unityVersion, targetPlatform } = body;
    const buildInfo: BuildInfo = {
      baseOs,
      repoVersion,
      unityVersion,
      targetPlatform,
    };

    await CiJobs.markJobAsInProgress(jobId);
    await CiBuilds.registerNewBuild(buildId, jobId, imageType, buildInfo);

    firebase.logger.info('new build reported', body);
    res.status(200).send('OK');
  } catch (err) {
    const message = `
      Something went wrong while wrong while reporting a new build.
      ${err.message} (${err.status})\n${err.stackTrace}
    `;
    firebase.logger.error(message);
    await Discord.sendAlert(message);
    res.status(500).send('Something went wrong');
  } finally {
    await Discord.disconnect();
  }
});
