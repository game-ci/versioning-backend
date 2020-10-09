import * as firebase from 'firebase-functions';
import * as firebaseAdmin from 'firebase-admin';
import { getCredential } from './credential';

const admin = firebaseAdmin.initializeApp({
  credential: getCredential(),
  databaseURL: 'https://unity-ci-versions.firebaseio.com',
});

const db = admin.firestore();

// Set functions to same region as database and hosting
const functions = firebase.region('europe-west3');

export { firebase, db, functions };
