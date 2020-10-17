import { db, admin } from '../config/firebase';
import { EditorVersionInfo } from './editorVersionInfo';
import FieldValue = admin.firestore.FieldValue;
import Timestamp = admin.firestore.Timestamp;
import { RepoVersionInfo } from './repoVersions';
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
  static getAll = async (): Promise<CiJob[]> => {
    const snapshot = await db.collection(COLLECTION).get();

    return snapshot.docs.map((doc) => doc.data()) as CiJob[];
  };

  static create = async (
    imageType: ImageType,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null = null,
  ) => {
    const jobId = await CiJobs.generateJobId(imageType, repoVersionInfo, editorVersionInfo);
    await db
      .collection(COLLECTION)
      .doc(jobId)
      .set({
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
      });
  };

  static markJobAsInProgress = async (jobId: string) => {
    const job = await db.collection(COLLECTION).doc(jobId);
    const snapshot = await job.get();
    const currentBuild = snapshot.data() as CiJob;

    // TODO - move this logic out of the model
    // Do not override failure or completed
    let { status } = currentBuild;
    if ([JobStatus.created, JobStatus.scheduled].includes(status)) {
      status = JobStatus.inProgress;
    }

    await job.update({
      status,
      'meta.lastBuildStart': Timestamp.now(),
      modifiedDate: Timestamp.now(),
    });
  };

  static markFailureForJob = async (jobId: string) => {
    const job = await db.collection(COLLECTION).doc(jobId);

    await job.update({
      status: JobStatus.failure,
      'meta.failures': FieldValue.increment(1),
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

  static generateJobId(
    imageType: string,
    repoVersionInfo: RepoVersionInfo,
    editorVersionInfo: EditorVersionInfo | null,
  ) {
    const { version: repoVersion } = repoVersionInfo;

    if (imageType !== 'editor') {
      return `${imageType}-${repoVersion}`;
    }

    if (editorVersionInfo === null) {
      throw new Error('editorVersionInfo must be provided for editor build jobs.');
    }

    const { version: editorVersion } = editorVersionInfo;
    return `${imageType}-${editorVersion}-${repoVersion}`;
  }
}
