import { EventContext } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { firebase, functions } from '../config/firebase';

import { COLLECTION, EditorVersionInfo } from '../model/editorVersionInfo';
import { CiJobs } from '../model/ciJobs';
import { RepoVersionInfo } from '../model/repoVersionInfo';

const imageType = 'editor';

export const onItemCreated = functions.firestore
  .document(`${COLLECTION}/{itemId}`)
  .onCreate(async (snapshot: QueryDocumentSnapshot, context: EventContext) => {
    const editorVersionInfo = snapshot.data() as EditorVersionInfo;
    const repoVersionInfo = await RepoVersionInfo.getLatest();

    const jobId = CiJobs.generateJobId(imageType, repoVersionInfo, editorVersionInfo);
    if (await CiJobs.exists(jobId)) {
      firebase.logger.warn('Skipped creating CiJob for new editorVersion.');
      return;
    }

    await CiJobs.create(jobId, imageType, repoVersionInfo, editorVersionInfo);
    firebase.logger.info(`CiJob created: ${jobId}`);
  });
