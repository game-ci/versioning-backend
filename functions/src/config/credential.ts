import { credential } from 'firebase-admin';

export const getCredential = (): credential.Credential => {
  try {
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      '../../service-account.json');
    return credential.cert(serviceAccount);
  } catch (e) {
    return credential.applicationDefault();
  }
};
