import { db, admin, firebase } from '../config/firebase';
import { EditorVersionInfo } from './editorVersionInfo';
import FieldValue = admin.firestore.FieldValue;
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersionInfo';
import { ImageType } from './ciBuilds';

const COLLECTION = 'ciJobs';

enum JobStatus {
  created,
  scheduled,
  inProgress,
  completed,
  failure,
}

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

/**
 * A CI job is a high level job, that schedules builds on a [repoVersion-unityVersion] level
 */
export class CiJobs {
  static get = async (jobId: string): Promise<CiJob | null> => {
    const ref = await db.collection(COLLECTION).doc(jobId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as CiJob;
  };

  static exists = async (jobId: string): Promise<boolean> => {
    return (await CiJobs.get(jobId)) === null;
  };

  static getAll = async (): Promise<CiJob[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiJob[];
  };

  static create = async (
    jobId: string,
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null = null,
  ) => {
    const job: CiJob = {
      status: JobStatus.created,
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

    const result = await db.collection(COLLECTION).doc(jobId).create(job);
    firebase.logger.debug('Job created', result);
  };

  static markJobAsInProgress = async (jobId: string) => {
    const ref = await db.collection(COLLECTION).doc(jobId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new Error(`Trying to mark job '${jobId}' as in progress. But it does not exist.`);
    }

    const currentBuild = snapshot.data() as CiJob;
    firebase.logger.warn(currentBuild);

    // Do not override failure or completed
    let { status } = currentBuild;
    if ([JobStatus.created, JobStatus.scheduled].includes(status)) {
      status = JobStatus.inProgress;
    }

    await ref.update({
      status,
      'meta.lastBuildStart': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markFailureForJob = async (jobId: string) => {
    const job = await db.collection(COLLECTION).doc(jobId);

    await job.update({
      status: JobStatus.failure,
      'meta.failureCount': FieldValue.increment(1),
      'meta.lastBuildFailure': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markJobAsCompleted = async (jobId: string) => {
    const job = await db.collection(COLLECTION).doc(jobId);

    await job.update({
      status: JobStatus.completed,
      modifiedDate: Timestamp.now(),
    });
  };

  static async removeDryRunJob(jobId: string) {
    if (!jobId.startsWith('dryRun')) {
      throw new Error('Expect only dryRun jobs to be deleted.');
    }

    await db.collection(COLLECTION).doc(jobId).delete();
  }

  static generateJobId(
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null,
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
}
