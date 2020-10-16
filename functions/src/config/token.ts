import { firebase } from './firebase';

const { token } = firebase.config().internal;

export class Token {
  static get internal() {
    return token;
  }

  static isValid(providedToken: string) {
    return providedToken === this.internal;
  }
}
