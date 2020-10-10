import { db, admin, firebase } from '../config/firebase';
import { UnityVersionInfo } from './unityVersionInfo';
import FieldValue = admin.firestore.FieldValue;
import Timestamp = admin.firestore.Timestamp;

const COLLECTION = 'buildQueue';

enum Status {
  created,
  awaitingWorker,
  inProgress,
  published,
  failure,
}

export interface BuildQueueItem {
  unityVersionInfo: UnityVersionInfo;
  status: Status;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
  publishedDate: Timestamp | null;
}

export class BuildQueue {
  static getAll = async (): Promise<BuildQueueItem[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as BuildQueueItem[];
  };

  static enqueue = async (unityVersionInfo: UnityVersionInfo) => {
    try {
      await db.collection(COLLECTION).doc('some elaborate id').set({
        unityVersionInfo,
        status: Status.created,
        addedDate: Timestamp.now(),
        modifiedDate: Timestamp.now(),
        lastBuildStart: null,
        failureCount: 0,
        lastBuildFailure: null,
        publishedDate: null,
      });
    } catch (err) {
      firebase.logger.error('Error occurred while trying to enqueue a new build', err);
    }
  };

  static markBuildAsInProgress = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.inProgress,
      lastBuildStart: Timestamp.now(),
    });
  };

  static markBuildAsFailed = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.failure,
      lastBuildFailure: Timestamp.now(),
      failures: FieldValue.increment(1),
    });
  };

  static markBuildAsPublished = async (id: string, hash: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.published,
      publishedDate: Timestamp.now(),
    });
  };
}
