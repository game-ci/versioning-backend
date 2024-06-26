import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { defineSecret } from 'firebase-functions/params';
import { scrapeVersions } from '../logic/ingestRepoVersions/scrapeVersions';
import { scrapeVersions as scrapeUnityVersions } from '../logic/ingestUnityVersions/scrapeVersions';

import { Discord } from '../service/discord';

const discordToken = defineSecret('DISCORD_TOKEN');
const githubPrivateKeyConfigSecret = defineSecret('GITHUB_PRIVATE_KEY');
const githubClientSecretConfigSecret = defineSecret('GITHUB_CLIENT_SECRET');
const internalToken = defineSecret('INTERNAL_TOKEN');

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
    let info = 'Ok';
    let code = 200;

    try {
      await Discord.init(discordToken.value());

      const versions = await scrapeVersions(
        githubPrivateKeyConfigSecret.value(),
        githubClientSecretConfigSecret.value(),
      );

      if (versions.length === 0) {
        throw new Error('No versions were found.');
      }

      const unityVersions = await scrapeUnityVersions();
      if (unityVersions.length === 0) {
        throw new Error('No Unity versions were found.');
      }

      info = `Found ${versions.length} repo versions and ${
        unityVersions.length
      } Unity versions. Unity Versions: \n${unityVersions
        .map((unity) => `${unity.version}:${unity.changeSet}`)
        .join('\n')}`;
    } catch (error: any) {
      info = error.message;
      code = 500;
    } finally {
      await Discord.disconnect();
    }

    response.status(code).send(info);
  },
);
