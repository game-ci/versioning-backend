import { EventContext } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { firebase, functions } from '../config/firebase';

export const onItemCreated = functions.firestore
  .document('buildQueue/{itemId}')
  .onCreate((snap: QueryDocumentSnapshot, context: EventContext) => {
    // Todo - create repository_dispatch event
    // https://developer.github.com/v3/repos/#create-a-repository-dispatch-event

    // Todo - Lock record on successful dispatch

    const newValue = snap.data();
    firebase.logger.info('buildQueue item created', newValue);
  });
