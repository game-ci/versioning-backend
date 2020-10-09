import * as admin from 'firebase-admin';

export const getCredential = (): admin.credential.Credential => {
  try {
    const serviceAccount = require('../../service-account.json');
    return admin.credential.cert(serviceAccount);
  } catch (e) {
    return admin.credential.applicationDefault();
  }
};
