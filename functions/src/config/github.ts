import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { settings } from './settings';
import { firebase } from './firebase';

const { 'private-key': privateKey } = firebase.config().github;

// const authInterface = createAppAuth({ ...settings.github.auth, privateKey, clientSecret });

const appOctokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    id: settings.github.auth.id,
    privateKey,
  },
});

export { appOctokit };
