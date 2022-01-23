import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { firebase, functions } from '../service/firebase';

import { EditorVersionInfo } from '../model/editorVersionInfo';
import { CiJobs } from '../model/ciJobs';
import { RepoVersionInfo } from '../model/repoVersionInfo';
import { Discord } from '../service/discord';
import { Image } from '../model/image';

export const onCreate = functions.firestore
  .document(`${EditorVersionInfo.collection}/{itemId}`)
  .onCreate(async (snapshot: QueryDocumentSnapshot) => {
    const editorVersionInfo = snapshot.data() as EditorVersionInfo;
    const repoVersionInfo = await RepoVersionInfo.getLatest();

    const jobId = CiJobs.generateJobId(Image.types.editor, repoVersionInfo, editorVersionInfo);
    if (await CiJobs.exists(jobId)) {
      const message = `Skipped creating CiJob for new editorVersion (${editorVersionInfo.version}).`;
      firebase.logger.warn(message);
      await Discord.sendAlert(message);
      return;
    }

    await CiJobs.create(jobId, Image.types.editor, repoVersionInfo, editorVersionInfo);
    firebase.logger.info(`CiJob created: ${jobId}`);
  });
