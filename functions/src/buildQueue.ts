import { EventContext } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { Request } from 'firebase-functions/lib/providers/https';

const { firebase, functions } = require('./shared');

export const onItemCreated = functions.firestore
  .document('buildQueue/{itemId}')
  .onCreate((snap: QueryDocumentSnapshot, context: EventContext) => {
    // Todo - create repository_dispatch event
    // https://developer.github.com/v3/repos/#create-a-repository-dispatch-event

    // Todo - Lock record on successful dispatch

    const newValue = snap.data();
    firebase.logger.info(newValue);
  });

export const reportBack = functions.https.onRequest(async (request: Request, response: any) => {
  // Todo - implement bearer token
  // https://github.com/firebase/functions-samples/blob/master/authorized-https-endpoint/functions/index.js

  // Todo - When unsuccessful: Unlock buildQueue item
  // Todo - When successful: Remove buildQueue item and add it to builtVersions

  firebase.logger.info('image build reported back');
});
