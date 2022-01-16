import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { settings } from '../config/settings';
import { firebase } from './firebase';

const { 'private-key': privateKey, 'client-secret': clientSecret } = firebase.config().github;

export class GitHub {
  // https://octokit.github.io/rest.js/v18
  static async init(): Promise<Octokit> {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        ...settings.github.auth,
        privateKey,
        clientSecret,
      },
    });

    const { data } = await appOctokit.request('/app');
    firebase.logger.debug('app parameters', data);

    return appOctokit;
  }
}
