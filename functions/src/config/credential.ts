import { credential } from 'firebase-admin';

export const getCredential = (): credential.Credential => {
  try {
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '');
    return credential.cert(serviceAccount);
  } catch (e) {
    return credential.applicationDefault();
  }
};
