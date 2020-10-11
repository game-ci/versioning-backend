import { db, admin, firebase } from '../config/firebase';
import { UnityVersionInfo } from './unityVersionInfo';
import FieldValue = admin.firestore.FieldValue;
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersions';

const COLLECTION = 'buildQueue';

enum JobStatus {
  created,
  scheduled,
  inProgress,
  completed,
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

export interface CiJob {
  status: JobStatus;
  meta: MetaData;
  repoVersionInfo: RepoVersionInfo;
  unityVersionInfo: UnityVersionInfo;
  dockerInfo: DockerInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
}

export class CiJobs {
  static getAll = async (): Promise<CiJob[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiJob[];
  };

  static create = async (unityVersionInfo: UnityVersionInfo, repoVersionInfo: RepoVersionInfo) => {
    try {
      await db
        .collection(COLLECTION)
        .doc('some elaborate id')
        .set({
          status: JobStatus.created,
          repoVersionInfo,
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

  static markJobAsInProgress = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    const snapshot = await build.get();
    const currentBuild = snapshot.data() as CiJob;

    // TODO - move this logic out of the model
    // Do not override failure or completed
    let { status } = currentBuild;
    if ([JobStatus.created, JobStatus.scheduled].includes(status)) {
      status = JobStatus.inProgress;
    }

    await build.update({
      status,
      'meta.lastBuildStart': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markJobAsFailed = async (id: string) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: JobStatus.failure,
      'meta.failures': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markJobAsCompleted = async (id: string, dockerInfo: DockerInfo) => {
    const build = await db.collection(COLLECTION).doc(id);

    await build.update({
      status: JobStatus.completed,
      dockerInfo,
      modifiedDate: Timestamp.now(),
      'meta.publishedDate': Timestamp.now(),
    });
  };
}
