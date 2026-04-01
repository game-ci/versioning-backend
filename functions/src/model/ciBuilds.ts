import { admin, db } from '../service/firebase';
import { logger } from 'firebase-functions/v2';
import { settings } from '../config/settings';
import { CiJobs } from './ciJobs';
import { BaseOs, ImageType } from './image';
import Timestamp = admin.firestore.Timestamp;
import FieldValue = admin.firestore.FieldValue;

export type BuildStatus = 'started' | 'failed' | 'published';

// Used in Start API
export interface BuildInfo {
  baseOs: BaseOs;
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

export type CiBuildQueueItem = { id: string; data: CiBuild };
export type CiBuildQueue = CiBuildQueueItem[];

/**
 * A CI Build represents a single [baseOs-unityVersion-targetPlatform] build.
 * These builds are reported in and run on GitHub Actions.
 * Statuses (failures and publications) are also reported back on this level.
 */
export class CiBuilds {
  public static get collection() {
    return 'ciBuilds';
  }

  public static getAll = async (): Promise<CiBuild[]> => {
    const snapshot = await db.collection(CiBuilds.collection).get();

    return snapshot.docs.map((doc) => doc.data()) as CiBuild[];
  };

  public static get = async (buildId: string): Promise<CiBuild | null> => {
    const snapshot = await db.doc(`${CiBuilds.collection}/${buildId}`).get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as CiBuild;
  };

  public static getStartedBuilds = async (): Promise<CiBuild[]> => {
    const realisticMaximumConcurrentBuilds = settings.maxConcurrentJobs * 10;

    const snapshot = await db
      .collection(CiBuilds.collection)
      .where('status', '==', 'started')
      .limit(realisticMaximumConcurrentBuilds)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CiBuild);
  };

  public static getFailedBuildsQueue = async (jobId: string): Promise<CiBuildQueue> => {
    const snapshot = await db
      .collection(CiBuilds.collection)
      .where('relatedJobId', '==', jobId)
      .where('status', '==', 'failed')
      .limit(settings.maxConcurrentJobs)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as CiBuild,
    }));
  };

  /**
   * Registers a new build or handles duplicate dispatches gracefully.
   * Returns the existing status if the build is already in progress or published,
   * so the caller can respond appropriately without causing errors.
   */
  public static registerNewBuild = async (
    buildId: string,
    relatedJobId: string,
    imageType: ImageType,
    buildInfo: BuildInfo,
  ): Promise<{ alreadyExists: boolean; existingStatus?: BuildStatus }> => {
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

    const ref = await db.collection(CiBuilds.collection).doc(buildId);
    const snapshot = await ref.get();

    let result;
    if (snapshot.exists) {
      const existingStatus = snapshot.data()?.status as BuildStatus;

      // Builds can be retried after a failure.
      if (existingStatus === 'failed') {
        // In case or reporting a new build during retry step, only overwrite these fields
        result = await ref.set(data, {
          mergeFields: ['status', 'meta.lastBuildStart', 'modifiedDate'],
        });
      } else {
        // Build is already in progress or published — duplicate dispatch, not an error.
        logger.info(
          `Build "${buildId}" already exists with status "${existingStatus}". Ignoring duplicate dispatch.`,
        );
        return { alreadyExists: true, existingStatus };
      }
    } else {
      result = await ref.create(data);
    }

    logger.debug('Build created', result);
    return { alreadyExists: false };
  };

  public static async removeDryRunBuild(buildId: string) {
    if (!buildId.startsWith('dryRun')) {
      throw new Error('Unexpected behaviour, expected only dryRun builds to be deleted');
    }

    const ref = await db.collection(CiBuilds.collection).doc(buildId);
    const doc = await ref.get();
    logger.info('dryRun produced this build endResult', doc.data());

    await ref.delete();
  }

  public static markBuildAsFailed = async (
    buildId: string,
    failure: BuildFailure,
  ): Promise<boolean> => {
    const build = db.collection(CiBuilds.collection).doc(buildId);
    const snapshot = await build.get();

    // Never overwrite a published build — it was already successfully uploaded.
    if (snapshot.exists && snapshot.data()?.status === 'published') {
      logger.warn(`Ignoring failure report for "${buildId}" because it is already published.`);
      return false;
    }

    await build.update({
      status: 'failed',
      failure,
      modifiedDate: Timestamp.now(),
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
    });

    return true;
  };

  public static markBuildAsPublished = async (
    buildId: string,
    jobId: string,
    dockerInfo: DockerInfo,
  ): Promise<boolean> => {
    const build = await db.collection(CiBuilds.collection).doc(buildId);

    await build.update({
      status: 'published',
      dockerInfo,
      modifiedDate: Timestamp.now(),
      'meta.publishedDate': Timestamp.now(),
    });

    const parentJobIsNowCompleted = await CiBuilds.haveAllBuildsForJobBeenPublished(jobId);
    if (parentJobIsNowCompleted) {
      await CiJobs.markJobAsCompleted(jobId);
    }

    return parentJobIsNowCompleted;
  };

  public static resetFailureCount = async (buildId: string): Promise<void> => {
    const build = db.collection(CiBuilds.collection).doc(buildId);
    await build.update({
      'meta.failureCount': 0,
      'meta.lastBuildFailure': null,
      modifiedDate: Timestamp.now(),
    });
  };

  public static getMaxedOutFailedBuilds = async (): Promise<CiBuildQueue> => {
    const snapshot = await db.collection(CiBuilds.collection).where('status', '==', 'failed').get();

    return snapshot.docs
      .filter((doc) => {
        const data = doc.data() as CiBuild;
        return (data.meta?.failureCount ?? 0) >= settings.maxFailuresPerBuild;
      })
      .map((doc) => ({
        id: doc.id,
        data: doc.data() as CiBuild,
      }));
  };

  public static haveAllBuildsForJobBeenPublished = async (jobId: string): Promise<boolean> => {
    const snapshot = await db
      .collection(CiBuilds.collection)
      .where('relatedJobId', '==', jobId)
      .where('status', '!=', 'published')
      .limit(1)
      .get();

    return snapshot.docs.length === 0;
  };
}
