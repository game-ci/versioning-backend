import { db, admin, firebase } from '../config/firebase';
import { EditorVersionInfo } from './editorVersionInfo';
import FieldValue = admin.firestore.FieldValue;
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersionInfo';
import { ImageType } from './ciBuilds';
import DocumentSnapshot = admin.firestore.DocumentSnapshot;
import { chunk } from 'lodash';
import { settings } from '../config/settings';

export const CI_JOBS_COLLECTION = 'ciJobs';

export type JobStatus =
  | 'created'
  | 'scheduled'
  | 'inProgress'
  | 'completed'
  | 'failed'
  | 'superseded';

interface MetaData {
  lastBuildStart: Timestamp | null;
  failureCount: number;
  lastBuildFailure: Timestamp | null;
}

export interface CiJob {
  status: JobStatus;
  meta: MetaData;
  imageType: ImageType;
  repoVersionInfo: RepoVersionInfo;
  editorVersionInfo: EditorVersionInfo | null;
  addedDate: Timestamp;
  modifiedDate: Timestamp;
}

export type CiJobQueue = { id: string; job: CiJob }[];

/**
 * A CI job is a high level job, that schedules builds on a [repoVersion-unityVersion] level
 */
export class CiJobs {
  static get = async (jobId: string): Promise<CiJob | null> => {
    const ref = await db.collection(CI_JOBS_COLLECTION).doc(jobId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as CiJob;
  };

  static exists = async (jobId: string): Promise<boolean> => {
    return (await CiJobs.get(jobId)) !== null;
  };

  static getAll = async (): Promise<CiJob[]> => {
    const snapshot = await db.collection(CI_JOBS_COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiJob[];
  };

  static getAllIds = async (): Promise<string[]> => {
    const snapshot = await db.collection(CI_JOBS_COLLECTION).get();

    return snapshot.docs.map(({ id }) => id);
  };

  static getPrioritisedQueue = async (): Promise<CiJobQueue> => {
    // Note: we can't simply do select distinct major, max(minor), max(patch) in nosql
    const snapshot = await db
      .collection(CI_JOBS_COLLECTION)
      .orderBy('major', 'desc')
      .orderBy('minor', 'desc')
      .orderBy('patch', 'desc')
      .where('status', '==', 'created')
      .limit(settings.maxConcurrentJobs)
      .get();

    firebase.logger.debug(`BuildQueue size: ${snapshot.docs.length}`);

    const queue: CiJobQueue = [];
    snapshot.docs.forEach((doc) => {
      queue.push({ id: doc.id, job: doc.data() as CiJob });
    });

    firebase.logger.debug(`BuildQueue`, queue);

    return queue;
  };

  static getFailingJobs = async (): Promise<CiJob[]> => {
    const snapshot = await db.collection(CI_JOBS_COLLECTION).where('status', '==', 'failed').get();

    return snapshot.docs.map((doc) => doc.data()) as CiJob[];
  };

  static getNumberOfScheduledJobs = async (): Promise<number> => {
    const snapshot = await db
      .collection(CI_JOBS_COLLECTION)
      .where('status', 'in', ['scheduled', 'inProgress'])
      .limit(settings.maxConcurrentJobs)
      .get();

    return snapshot.docs.length;
  };

  static create = async (
    jobId: string,
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null = null,
  ) => {
    const job = CiJobs.construct(imageType, repoVersionInfo, editorVersionInfo);
    const result = await db.collection(CI_JOBS_COLLECTION).doc(jobId).create(job);
    firebase.logger.debug('Job created', result);
  };

  static construct = (
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null = null,
  ): CiJob => {
    const job: CiJob = {
      status: 'created',
      imageType,
      repoVersionInfo,
      editorVersionInfo,
      meta: {
        lastBuildStart: null,
        failureCount: 0,
        lastBuildFailure: null,
      },
      addedDate: Timestamp.now(),
      modifiedDate: Timestamp.now(),
    };

    return job;
  };

  static markJobAsScheduled = async (jobId: string) => {
    const ref = await db.collection(CI_JOBS_COLLECTION).doc(jobId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new Error(`Trying to mark job '${jobId}' as scheduled. But it does not exist.`);
    }

    const currentBuild = snapshot.data() as CiJob;
    firebase.logger.warn(currentBuild);

    // Do not override failure or completed
    let { status } = currentBuild;
    if (['created', 'failed'].includes(status)) {
      status = 'scheduled';
    }

    await ref.update({
      status,
      modifiedDate: Timestamp.now(),
    });
  };

  static markJobAsInProgress = async (jobId: string) => {
    const ref = await db.collection(CI_JOBS_COLLECTION).doc(jobId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new Error(`Trying to mark job '${jobId}' as in progress. But it does not exist.`);
    }

    const currentBuild = snapshot.data() as CiJob;
    firebase.logger.warn(currentBuild);

    // Do not override failure or completed
    let { status } = currentBuild;
    if (['scheduled'].includes(status)) {
      status = 'inProgress';
    }

    await ref.update({
      status,
      'meta.lastBuildStart': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markFailureForJob = async (jobId: string) => {
    const job = await db.collection(CI_JOBS_COLLECTION).doc(jobId);

    await job.update({
      status: 'failed',
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markJobAsCompleted = async (jobId: string) => {
    const job = await db.collection(CI_JOBS_COLLECTION).doc(jobId);

    await job.update({
      status: 'completed',
      modifiedDate: Timestamp.now(),
    });
  };

  static async removeDryRunJob(jobId: string) {
    if (!jobId.startsWith('dryRun')) {
      throw new Error('Expect only dryRun jobs to be deleted.');
    }

    await db.collection(CI_JOBS_COLLECTION).doc(jobId).delete();
  }

  static markJobsBeforeRepoVersionAsSuperseded = async (repoVersion: string): Promise<number> => {
    firebase.logger.info('superseding jobs before repo version', repoVersion);

    // Note: Cannot have inequality filters on multiple properties
    const snapshot = await db
      .collection(CI_JOBS_COLLECTION)
      .where('repoVersionInfo.version', '<', repoVersion)
      .where('status', '==', 'created')
      .get();

    const numSuperseded = snapshot.docs.length;
    firebase.logger.debug(`superseding ${CiJobs.pluralise(numSuperseded)}`);

    // Batches can only have 20 document access calls per transaction
    // See: https://firebase.google.com/docs/firestore/manage-data/transactions
    // Note: Set counts as 2 access calls
    const status: JobStatus = 'superseded';
    const docsChunks: DocumentSnapshot[][] = chunk(snapshot.docs, 10);
    for (const docsChunk of docsChunks) {
      const batch = db.batch();
      for (const doc of docsChunk) {
        batch.set(doc.ref, { status }, { merge: true });
      }
      await batch.commit();
      firebase.logger.debug('committed batch of superseded jobs');
    }

    return numSuperseded;
  };

  static generateJobId(
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null = null,
  ) {
    const { version: repoVersion } = repoVersionInfo;
    if (imageType !== 'editor') {
      return CiJobs.parseJobId(imageType, repoVersion);
    }

    if (editorVersionInfo === null) {
      throw new Error('editorVersionInfo must be provided for editor build jobs.');
    }
    const { version: editorVersion } = editorVersionInfo;

    return CiJobs.parseJobId(imageType, repoVersion, editorVersion);
  }

  static parseJobId(
    imageType: ImageType,
    repoVersion: string,
    editorVersion: string | null = null,
  ) {
    if (imageType !== 'editor') {
      return `${imageType}-${repoVersion}`;
    }

    if (editorVersion === null) {
      throw new Error('editorVersion must be provided for editor build jobs.');
    }

    return `${imageType}-${editorVersion}-${repoVersion}`;
  }

  static pluralise(number: number) {
    const word = number === 1 ? 'CI Job' : 'CI Jobs';
    return `${number} ${word}`;
  }
}
