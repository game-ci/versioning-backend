import { functions } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { CiJobs } from '../model/ciJobs';
import { CiBuilds } from '../model/ciBuilds';

export const queueStatus = functions.https.onRequest(async (req: Request, res: Response) => {
  const jobs = await CiJobs.getAll();
  const builds = await CiBuilds.getAll();

  res.status(200).send({ jobs, builds });
});
