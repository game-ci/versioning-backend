import { firebase, functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { Token } from '../config/token';
import { BuildInfo, CiBuilds, ImageType } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Discord } from '../config/discord';
import { EditorVersionInfo } from '../model/editorVersionInfo';
import { RepoVersionInfo } from '../model/repoVersionInfo';

export const reportNewBuild = functions.https.onRequest(async (req: Request, res: Response) => {
  try {
    if (!Token.isValid(req.header('authorization'))) {
      firebase.logger.warn('unauthorised request', req.headers);
      res.status(403).send('Unauthorized');
      return;
    }

    const { body } = req;
    firebase.logger.debug('new incoming build report', body);

    const { buildId, jobId, imageType, baseOs, repoVersion, editorVersion, targetPlatform } = body;
    const buildInfo: BuildInfo = {
      baseOs,
      repoVersion,
      editorVersion,
      targetPlatform,
    };

    if (jobId.toString().startsWith('dryRun')) {
      await createDryRunJob(jobId, imageType, editorVersion);
    }

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
  }
});

const createDryRunJob = async (jobId: string, imageType: ImageType, editorVersion: string) => {
  firebase.logger.debug('running dryrun for image', imageType, editorVersion);
  const repoVersionInfo = await RepoVersionInfo.getLatest();

  if (imageType === 'editor') {
    const editorVersionInfo = await EditorVersionInfo.get(editorVersion);
    await CiJobs.create(jobId, imageType, repoVersionInfo, editorVersionInfo);
  } else {
    await CiJobs.create(jobId, imageType, repoVersionInfo);
  }
};
