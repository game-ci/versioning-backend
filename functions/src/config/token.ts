export class Token {
  static isValid(
    providedToken: string | null | undefined,
    internalToken: string,
  ) {
    if (!providedToken) return false;

    return providedToken === internalToken ||
      providedToken === `Bearer ${internalToken}`;
  }
}
