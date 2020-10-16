import { post } from 'httpie';
import { firebase } from './firebase';
import { Token } from './token';

export class Internal {
  static async post(endpoint: string, body: object = {}, extraHeaders: object = {}) {
    const host = 'https://europe-west3-unity-ci-versions.cloudfunctions.net';
    const headers = {
      Authorization: `Bearer ${Token.internal}`,
      ...extraHeaders,
    };
    // Todo - remove log to verify token
    firebase.logger.warn('auth token', headers.Authorization);

    await post(`${host}/${endpoint}`, { headers, body });
  }
}
