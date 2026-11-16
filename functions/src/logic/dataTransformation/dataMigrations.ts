import { chunk, countBy } from 'lodash';
import { logger } from 'firebase-functions/v2';
import { admin, db } from '../../service/firebase';
import { CiJob, CiJobs, JobStatus } from '../../model/ciJobs';
import { OLDEST_SUPPORTED_EDITOR_MAJOR } from '../../model/supportedEditorVersions';
import Timestamp = admin.firestore.Timestamp;
import QueryDocumentSnapshot = admin.firestore.QueryDocumentSnapshot;

/**
 * Statuses from which the scheduler, the Ingeminator or the Cleaner can still dispatch a build.
 * `completed`, `superseded` and `deprecated` are final and keep their history.
 */
const schedulableStatuses: JobStatus[] = ['created', 'failed', 'scheduled', 'inProgress'];

/** Firestore allows 500 writes per batch; staying well below leaves room for retries. */
const writesPerBatch = 250;

export type DeprecationSummary = {
  total: number;
  byStatus: Record<string, number>;
  byEditorVersion: Record<string, number>;
};

// Ordered like the build queue, so the query uses the index that serves `getPrioritisedQueue`.
// Base and hub jobs have no editor version, so the filter leaves them out.
const getEndOfLifeEditorJobs = async (status: JobStatus) =>
  db
    .collection(CiJobs.collection)
    .where('status', '==', status)
    .where('editorVersionInfo.major', '<', OLDEST_SUPPORTED_EDITOR_MAJOR)
    .orderBy('editorVersionInfo.major', 'desc')
    .orderBy('editorVersionInfo.minor', 'desc')
    .orderBy('editorVersionInfo.patch', 'desc')
    .get();

/**
 * Deprecates every job for an end-of-life editor that could still be dispatched, so builds for
 * those editors stop. Each write is conditional on the job being unchanged since it was read,
 * so a job that completes in the meantime is never overwritten. Safe to run repeatedly.
 */
export const migrateEndOfLifeEditorJobsToDeprecated = async (): Promise<DeprecationSummary> => {
  const jobsToDeprecate: QueryDocumentSnapshot[] = [];
  for (const status of schedulableStatuses) {
    const snapshot = await getEndOfLifeEditorJobs(status);
    jobsToDeprecate.push(...snapshot.docs);
  }

  if (jobsToDeprecate.length === 0) {
    logger.debug('[Migration] No schedulable CI Jobs for end-of-life editors left to deprecate.');
    return { total: 0, byStatus: {}, byEditorVersion: {} };
  }

  const status: JobStatus = 'deprecated';
  for (const docsChunk of chunk(jobsToDeprecate, writesPerBatch)) {
    const batch = db.batch();
    for (const doc of docsChunk) {
      batch.update(
        doc.ref,
        { status, modifiedDate: Timestamp.now() },
        { lastUpdateTime: doc.updateTime },
      );
    }
    await batch.commit();
  }

  const jobs = jobsToDeprecate.map((doc) => doc.data() as CiJob);
  const summary: DeprecationSummary = {
    total: jobs.length,
    byStatus: countBy(jobs, (job) => job.status),
    byEditorVersion: countBy(jobs, (job) => job.editorVersionInfo?.version),
  };
  logger.info(
    `[Migration] Deprecated ${CiJobs.pluralise(summary.total)} for end-of-life editors.`,
    summary,
  );

  return summary;
};

export const dataMigrations = async () => {
  await migrateEndOfLifeEditorJobsToDeprecated();
};
