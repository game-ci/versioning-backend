import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express-serve-static-core";
import { defineSecret } from "firebase-functions/params";
import { scrapeVersions } from "../logic/ingestRepoVersions/scrapeVersions";
import { Discord } from "../service/discord";

const discordToken = defineSecret("DISCORD_TOKEN");
const githubPrivateKeyConfigSecret = defineSecret("GITHUB_PRIVATE_KEY");
const githubClientSecretConfigSecret = defineSecret("GITHUB_CLIENT_SECRET");
const internalToken = defineSecret("INTERNAL_TOKEN");

export const testFunction = onRequest(
  {
    // Passing all secrets so that test deployments verify that the secrets are correctly set.
    secrets: [
      discordToken,
      githubPrivateKeyConfigSecret,
      githubClientSecretConfigSecret,
      internalToken,
    ],
  },
  async (request: Request, response: Response) => {
    // Run all non-sensitive functions to verify that the deployment is working.
    const discordClient = new Discord();
    let info = "Ok";
    let code = 200;

    try {
      await discordClient.init(discordToken.value());

      const versions = await scrapeVersions(
        githubPrivateKeyConfigSecret.value(),
        githubClientSecretConfigSecret.value(),
      );

      if (versions.length === 0) {
        info = "No versions were found.";
        code = 500;
        return;
      }
    } catch (error: any) {
      info = error.message;
      code = 500;
    } finally {
      await discordClient.disconnect();
    }

    response.status(code).send(info);
  },
);
