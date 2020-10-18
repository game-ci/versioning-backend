import { EventContext } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { firebase, functions } from '../config/firebase';

import { COLLECTION, EditorVersionInfo } from '../model/editorVersionInfo';
import { CiJobs } from '../model/ciJobs';
import { RepoVersionInfo } from '../model/repoVersionInfo';
import { Discord } from '../config/discord';

const imageType = 'editor';

export const onCreate = functions.firestore
  .document(`${COLLECTION}/{itemId}`)
  .onCreate(async (snapshot: QueryDocumentSnapshot, context: EventContext) => {
    const editorVersionInfo = snapshot.data() as EditorVersionInfo;
    const repoVersionInfo = await RepoVersionInfo.getLatest();

    const jobId = CiJobs.generateJobId(imageType, repoVersionInfo, editorVersionInfo);
    if (await CiJobs.exists(jobId)) {
      const message = `Skipped creating CiJob for new editorVersion (${editorVersionInfo.version}).`;
      firebase.logger.warn(message);
      await Discord.sendAlert(message);
      return;
    }

    await CiJobs.create(jobId, imageType, repoVersionInfo, editorVersionInfo);
    firebase.logger.info(`CiJob created: ${jobId}`);
  });
