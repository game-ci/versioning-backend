import { credential } from 'firebase-admin';

export const getCredential = (): credential.Credential => {
  try {
    const serviceAccount = require('../../service-account.json');
    return credential.cert(serviceAccount);
  } catch (e) {
    return credential.applicationDefault();
  }
};
