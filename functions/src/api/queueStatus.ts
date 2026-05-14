import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { CiJobs } from '../model/ciJobs';
import { CiBuilds } from '../model/ciBuilds';

export const queueStatus = onRequest(async (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  const repoVersion = typeof req.query.repoVersion === 'string' ? req.query.repoVersion : '';
  const jobs = await CiJobs.getAll();
  const builds = repoVersion
    ? await CiBuilds.getAllForRepoVersion(repoVersion)
    : await CiBuilds.getAll();

  res.status(200).send({ jobs, builds, repoVersion: repoVersion || null });
});
