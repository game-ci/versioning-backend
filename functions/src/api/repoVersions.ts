import { onRequest, Request } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { Response } from "express-serve-static-core";
import { RepoVersionInfo } from "../model/repoVersionInfo";

export const repoVersions = onRequest(
  async (request: Request, response: Response) => {
    try {
      const versions = await RepoVersionInfo.getAllIds();

      response.send(versions);
    } catch (err) {
      logger.error(err);
      response.send("Oops.");
    }
  },
);
