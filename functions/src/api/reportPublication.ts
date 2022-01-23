import { firebase, functions } from '../service/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../service/discord';
import { Image } from '../model/image';

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
    const parentJobIsNowCompleted = await CiBuilds.markBuildAsPublished(buildId, jobId, dockerInfo);
    if (parentJobIsNowCompleted) {
      // Report new publications as news
      let message;
      if (dockerInfo.imageName === Image.types.editor) {
        // i.e. [editor-2017.1.0f3-0.5.0]
        const [imageType, publicationName, version] = jobId.split('-');
        // i.e. [v0.5.0] images for [editor] [2020.2.22f2]
        message = `Published v${version} images for ${imageType} ${publicationName}.`;
      } else {
        // i.e. [hub-0.5.0]
        const [publicationName, version] = jobId.split('-');
        // i.e. [hub] or [base] for v0.5.0
        message = `New ${publicationName}-image published for v${version}.`;
      }
      firebase.logger.info(message);
      if (!isDryRun) {
        await Discord.sendNews(message);
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
