import * as firebase from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getCredential } from './credential';

const app = admin.initializeApp({
  credential: getCredential(),
  databaseURL: 'https://unity-ci-versions.firebaseio.com',
});

const auth = app.auth();
const db = app.firestore();

// Set functions to same region as database and hosting
const functions = firebase.region('europe-west3');

export { firebase, admin, db, functions, auth };
