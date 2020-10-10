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

interface DockerInfo {
  tag: string;
  hash: string;
}

interface MetaData {
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
}

export interface BuildQueueItem {
  status: Status;
  meta: MetaData;
  unityVersionInfo: UnityVersionInfo;
  dockerInfo: DockerInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
  publishedDate: Timestamp;
}

export class BuildQueue {
  static getAll = async (): Promise<BuildQueueItem[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as BuildQueueItem[];
  };

  static enqueue = async (unityVersionInfo: UnityVersionInfo) => {
    try {
      await db
        .collection(COLLECTION)
        .doc('some elaborate id')
        .set({
          status: Status.created,
          unityVersionInfo,
          dockerInfo: null,
          meta: {
            lastBuildStart: null,
            failureCount: 0,
            lastBuildFailure: null,
          },
          addedDate: Timestamp.now(),
          modifiedDate: Timestamp.now(),
        });
    } catch (err) {
      firebase.logger.error('Error occurred while trying to enqueue a new build', err);
    }
  };

  static markBuildAsInProgress = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.inProgress,
      'meta.lastBuildStart': Timestamp.now(),
    });
  };

  static markBuildAsFailed = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.failure,
      'meta.lastBuildFailure': Timestamp.now(),
      'meta.failures': FieldValue.increment(1),
    });
  };

  static markBuildAsPublished = async (id: string, dockerInfo: DockerInfo) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: Status.published,
      dockerInfo,
      'meta.publishedDate': Timestamp.now(),
    });
  };
}
