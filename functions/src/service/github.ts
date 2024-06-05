import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { settings } from '../config/settings';
import { logger } from 'firebase-functions/v2';

export class GitHub {
  // https://octokit.github.io/rest.js/v18
  static async init(privateKey: string, clientSecret: string): Promise<Octokit> {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        ...settings.github.auth,
        privateKey,
        clientSecret,
      },
    });

    const { data } = await appOctokit.request('/app');
    logger.debug('app parameters', data);

    return appOctokit;
  }
}
