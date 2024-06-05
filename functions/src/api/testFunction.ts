import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { defineSecret } from 'firebase-functions/params';
import { scrapeVersions } from '../logic/ingestRepoVersions/scrapeVersions';

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
    const versions = await scrapeVersions(
      githubPrivateKeyConfigSecret.value(),
      githubClientSecretConfigSecret.value(),
    );

    if (versions.length === 0) {
      response.status(500).send('No versions were found.');
      return;
    }

    response.status(200).send('Ok');
  },
);
