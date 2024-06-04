import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('projects/841479186623/secrets/DISCORD_TOKEN');
const githubPrivateKeyConfigSecret = defineSecret(
  'projects/841479186623/secrets/GITHUB_PRIVATE_KEY',
);
const githubClientSecretConfigSecret = defineSecret(
  'projects/841479186623/secrets/GITHUB_CLIENT_SECRET',
);
const internalToken = defineSecret('projects/841479186623/secrets/INTERNAL_TOKEN');

export const testFunction = onRequest(
  {
    // Passing secrets so that test deployments verify that the secrets are correctly set.
    secrets: [
      discordToken,
      githubPrivateKeyConfigSecret,
      githubClientSecretConfigSecret,
      internalToken,
    ],
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async (request: Request, response: Response) => {},
);
