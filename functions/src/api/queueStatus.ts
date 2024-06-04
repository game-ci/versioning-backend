import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express-serve-static-core";
import { CiJobs } from "../model/ciJobs";
import { CiBuilds } from "../model/ciBuilds";

export const queueStatus = onRequest(async (req: Request, res: Response) => {
  const jobs = await CiJobs.getAll();
  const builds = await CiBuilds.getAll();

  res.status(200).send({ jobs, builds });
});
