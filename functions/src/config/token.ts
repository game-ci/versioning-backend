import { firebase } from '../service/firebase';

const { token } = firebase.config().internal;

export class Token {
  static get internal() {
    return token;
  }

  static isValid(providedToken: string | null | undefined) {
    if (!providedToken) return false;

    return providedToken === this.internal || providedToken === `Bearer ${this.internal}`;
  }
}
