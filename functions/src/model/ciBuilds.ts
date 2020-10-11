import { db, admin, firebase } from '../config/firebase';
import { UnityVersionInfo } from './unityVersionInfo';
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersions';
import FieldValue = admin.firestore.FieldValue;

const COLLECTION = 'ciBuilds';

enum BuildStatus {
  inProgress,
  failed,
  published,
}

interface DockerInfo {
  tag: string;
  hash: string;
  // date with docker as source of truth?
}

interface MetaData {
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
  publishedDate: Timestamp | null;
}

export interface CiBuild {
  status: BuildStatus;
  meta: MetaData;
  failure: CiBuildFailure | null;
  repoVersionInfo: RepoVersionInfo;
  unityVersionInfo: UnityVersionInfo;
  dockerInfo: DockerInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
}

export interface CiBuildFailure {
  reason: string;
}

export class CiBuilds {
  static getAll = async (): Promise<CiBuild[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiBuild[];
  };

  static create = async (unityVersionInfo: UnityVersionInfo, repoVersionInfo: RepoVersionInfo) => {
    try {
      await db
        .collection(COLLECTION)
        .doc('some elaborate id')
        .set({
          status: BuildStatus.inProgress,
          repoVersionInfo,
          unityVersionInfo,
          failure: null,
          meta: {
            lastBuildStart: Timestamp.now(),
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

  static markBuildAsFailed = async (id: string, failure: CiBuildFailure) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: BuildStatus.failed,
      failure,
      modifiedDate: Timestamp.now(),
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
    });
  };

  static markBuildAsPublished = async (id: string, dockerInfo: DockerInfo) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: BuildStatus.published,
      dockerInfo,
      modifiedDate: Timestamp.now(),
      'meta.publishedDate': Timestamp.now(),
    });
  };
}
