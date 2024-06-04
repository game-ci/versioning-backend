import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express-serve-static-core';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');
const githubPrivateKeyConfigSecret = defineSecret('GITHUB_PRIVATE_KEY');
const githubClientSecretConfigSecret = defineSecret('GITHUB_CLIENT_SECRET');
const internalToken = defineSecret('INTERNAL_TOKEN');

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
