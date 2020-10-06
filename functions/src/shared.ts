import * as firebase from 'firebase-functions';

// Set functions to same region as database and hosting
const functions = firebase.region('europe-west3');

export { firebase, functions };
