import * as firebase from 'firebase-functions';

// Set functions to same region as database and hosting
const functions = firebase.region('europe-west3');

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const helloWorld = functions.https.onRequest((request, response) => {
  firebase.logger.info('Hello logs!', { structuredData: true });
  response.send('Hello from Unity CI Versioning Backend!');
});
