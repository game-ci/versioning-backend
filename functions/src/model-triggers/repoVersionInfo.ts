import {
  FirestoreEvent,
  onDocumentCreated,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { db } from '../service/firebase';
import { logger } from 'firebase-functions/v2';

import { RepoVersionInfo } from '../model/repoVersionInfo';
import { CiJobs } from '../model/ciJobs';
import { EditorVersionInfo } from '../model/editorVersionInfo';
import semver from 'semver/preload';
import { Discord } from '../service/discord';
import { chunk } from 'lodash';
import { Image } from '../model/image';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');

export const onCreate = onDocumentCreated(
  {
    document: `${RepoVersionInfo.collection}/{itemId}`,
    secrets: [discordToken],
  },
  async (snapshot: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    await Discord.initSafely(discordToken.value());

    const repoVersionInfo = snapshot.data?.data() as RepoVersionInfo;
    const currentRepoVersion = repoVersionInfo.version;
    const latestRepoVersionInfo = await RepoVersionInfo.getLatest();

    // Only create new builds for tags that are newer semantic versions.
    if (semver.compare(currentRepoVersion, latestRepoVersionInfo.version) !== 0) {
      const semverMessage = `
        Skipped scheduling all editorVersions for new repoVersion,
        as it does not seem to be the newest version.`;
      logger.warn(semverMessage);
      await Discord.sendAlert(semverMessage);
      Discord.disconnect();
      return;
    }

    // Skip creating jobs that already exist.
    const existingJobIds = await CiJobs.getAllIds();
    const editorVersionInfos = await EditorVersionInfo.getAll();
    const skippedVersions: string[] = [];

    // Create database batch transaction
    const baseAndHubBatch = db.batch();

    // Job for base image
    const baseJobId = CiJobs.generateJobId('base', repoVersionInfo);
    if (existingJobIds.includes(baseJobId)) {
      skippedVersions.push(baseJobId);
    } else {
      const baseJobData = CiJobs.construct('base', repoVersionInfo);
      const baseJobRef = db.collection(CiJobs.collection).doc(baseJobId);
      baseAndHubBatch.create(baseJobRef, baseJobData);
    }

    // Job for hub image
    const hubJobId = CiJobs.generateJobId('hub', repoVersionInfo);
    if (existingJobIds.includes(hubJobId)) {
      skippedVersions.push(hubJobId);
    } else {
      const hubJobData = CiJobs.construct('hub', repoVersionInfo);
      const hubJobRef = db.collection(CiJobs.collection).doc(hubJobId);
      baseAndHubBatch.create(hubJobRef, hubJobData);
    }

    // End database bash transaction
    await baseAndHubBatch.commit();

    // Batches can only have 20 document access calls per transaction
    // See: https://firebase.google.com/docs/firestore/manage-data/transactions
    // Note that batch.set uses 2 document access calls.
    // But now `create` seems to also be supported in batch calls
    const editorVersionInfoChunks: EditorVersionInfo[][] = chunk(editorVersionInfos, 20);
    for (const editorVersionInfoChunk of editorVersionInfoChunks) {
      const imageType = Image.types.editor;
      const batch = db.batch();
      for (const editorVersionInfo of editorVersionInfoChunk) {
        const editorJobId = CiJobs.generateJobId(imageType, repoVersionInfo, editorVersionInfo);

        if (existingJobIds.includes(editorJobId)) {
          skippedVersions.push(editorJobId);
        } else {
          const editorJobData = CiJobs.construct(imageType, repoVersionInfo, editorVersionInfo);
          const editorJobRef = db.collection(CiJobs.collection).doc(editorJobId);
          batch.create(editorJobRef, editorJobData);
        }
      }
      await batch.commit();
    }
    // Wow, haha 😅

    // Report skipped versions
    if (skippedVersions.length >= 1) {
      const skippedVersionsMessage = `
        Skipped creating CiJobs for the following jobs \`${skippedVersions.join('`, `')}\`.`;
      logger.warn(skippedVersionsMessage);
      await Discord.sendAlert(skippedVersionsMessage);
    }

    // Report that probably many new jobs have now been scheduled
    const baseCount = 1;
    const hubCount = 1;
    const totalNewJobs = editorVersionInfos.length + baseCount + hubCount - skippedVersions.length;
    const newJobs = CiJobs.pluralise(totalNewJobs);
    const newJobsMessage = `Created ${newJobs} for version \`${currentRepoVersion}\` of unity-ci/docker.`;
    logger.info(newJobsMessage);
    await Discord.sendNews(newJobsMessage);

    // Supersede any non-complete jobs before the current version
    const numSuperseded = await CiJobs.markJobsBeforeRepoVersionAsSuperseded(currentRepoVersion);
    if (numSuperseded >= 1) {
      const replacementMessage = `
      ${CiJobs.pluralise(numSuperseded)} that were for older versions are now superseded.`;
      logger.warn(replacementMessage);
      await Discord.sendMessageToMaintainers(replacementMessage);
    } else {
      logger.debug('no versions were superseded, as expected.');
    }

    await Discord.disconnect();
  },
);
