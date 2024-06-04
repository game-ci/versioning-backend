import { credential } from 'firebase-admin';
import { readFileSync } from 'node:fs';

export const getCredential = (): credential.Credential => {
  try {
    const serviceAccount = readFileSync('../../service-account.json').toString();
    return credential.cert(serviceAccount);
  } catch (e) {
    return credential.applicationDefault();
  }
};
