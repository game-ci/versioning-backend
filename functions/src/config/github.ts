import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { settings } from './settings';
import { firebase } from './firebase';

// Do not expose these as apis
const { 'private-key': privateKey, 'client-secret': clientSecret } = firebase.config().github;
const auth = createAppAuth({ ...settings.github.auth, privateKey, clientSecret });

export class GitHub {
  static async init() {
    // https://github.com/octokit/auth-app.js#usage
    const appAuthentication = await auth({ type: 'app' });
    const { token } = appAuthentication;

    // https://octokit.github.io/rest.js/v18#authentication
    return new Octokit({
      auth: token,
    });
  }
}
