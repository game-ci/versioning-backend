import { db, admin, firebase } from '../config/firebase';
import Timestamp = admin.firestore.Timestamp;
import FieldValue = admin.firestore.FieldValue;

const COLLECTION = 'ciBuilds';

export type BuildStatus = 'started' | 'failed' | 'published';
export type ImageType = 'base' | 'hub' | 'editor';

// Used in Start API
export interface BuildInfo {
  baseOs: string;
  repoVersion: string;
  editorVersion: string;
  targetPlatform: string;
}

// Used in Failure API
export interface BuildFailure {
  reason: string;
}

// Used in Publish API
export interface DockerInfo {
  imageRepo: string;
  imageName: string;
  friendlyTag: string;
  specificTag: string;
  digest: string;
  // date with docker as source of truth?
}

interface MetaData {
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
  publishedDate: Timestamp | null;
}

export interface CiBuild {
  buildId: string;
  relatedJobId: string;
  status: BuildStatus;
  imageType: ImageType;
  meta: MetaData;
  buildInfo: BuildInfo;
  failure: BuildFailure | null;
  dockerInfo: DockerInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
}

/**
 * A CI Build represents a single [baseOs-unityVersion-targetPlatform] build.
 * These builds are reported in and run on GitHub Actions.
 * Statuses (failures and publications) are also reported back on this level.
 */
export class CiBuilds {
  static getAll = async (): Promise<CiBuild[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiBuild[];
  };

  static registerNewBuild = async (
    buildId: string,
    relatedJobId: string,
    imageType: ImageType,
    buildInfo: BuildInfo,
  ) => {
    const data: CiBuild = {
      status: 'started',
      buildId,
      relatedJobId,
      imageType,
      buildInfo,
      failure: null,
      dockerInfo: null,
      meta: {
        lastBuildStart: Timestamp.now(),
        failureCount: 0,
        lastBuildFailure: null,
        publishedDate: null,
      },
      addedDate: Timestamp.now(),
      modifiedDate: Timestamp.now(),
    };

    const ref = await db.collection(COLLECTION).doc(buildId);
    const snapshot = await ref.get();

    let result;
    if (snapshot.exists) {
      if (snapshot.data()?.status === 'failed') {
        result = await ref.set(data, { merge: false });
      } else {
        throw new Error('A build with this identifier already exists');
      }
    } else {
      result = await ref.create(data);
    }

    firebase.logger.debug('Build created', result);
  };

  static async removeDryRunBuild(buildId: string) {
    if (!buildId.startsWith('dryRun')) {
      throw new Error('Unexpected behaviour, expected only dryRun builds to be deleted');
    }

    const ref = await db.collection(COLLECTION).doc(buildId);
    const doc = await ref.get();
    firebase.logger.info('dryRun produced this build endResult', doc.data());

    await ref.delete();
  }

  static markBuildAsFailed = async (buildId: string, failure: BuildFailure) => {
    const build = await db.collection(COLLECTION).doc(buildId);

    await build.update({
      status: 'failed',
      failure,
      modifiedDate: Timestamp.now(),
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
    });
  };

  static markBuildAsPublished = async (buildId: string, dockerInfo: DockerInfo) => {
    const build = await db.collection(COLLECTION).doc(buildId);

    await build.update({
      status: 'published',
      dockerInfo,
      modifiedDate: Timestamp.now(),
      'meta.publishedDate': Timestamp.now(),
    });
  };

  static haveAllBuildsForJobBeenPublished = async (jobId: string): Promise<boolean> => {
    const snapshot = await db
      .collection(COLLECTION)
      .where('jobId', '==', jobId)
      .where('status', '!=', 'published')
      .limit(1)
      .get();

    firebase.logger.info(snapshot.docs);

    return snapshot.docs.length <= 1;
  };
}
