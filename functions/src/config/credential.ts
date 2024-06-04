import { credential } from 'firebase-admin';

export const getCredential = (): credential.Credential => {
  try {
    return credential.cert('../../service-account.json');
  } catch (e) {
    return credential.applicationDefault();
  }
};
