import {
  FirestoreEvent,
  onDocumentCreated,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { EditorVersionInfo } from '../model/editorVersionInfo';
import { CiJobs } from '../model/ciJobs';
import { RepoVersionInfo } from '../model/repoVersionInfo';
import { Discord } from '../service/discord';
import { Image } from '../model/image';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');

export const onCreate = onDocumentCreated(
  {
    document: `${EditorVersionInfo.collection}/{itemId}`,
    secrets: [discordToken],
  },
  async (snapshot: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    const discordClient = new Discord();
    await discordClient.init(discordToken.value());

    const editorVersionInfo = snapshot.data?.data() as EditorVersionInfo;
    const repoVersionInfo = await RepoVersionInfo.getLatest();

    const jobId = CiJobs.generateJobId(Image.types.editor, repoVersionInfo, editorVersionInfo);
    if (await CiJobs.exists(jobId)) {
      const message = `Skipped creating CiJob for new editorVersion (${editorVersionInfo.version}).`;
      logger.warn(message);
      await discordClient.sendAlert(message);
      await discordClient.disconnect();
      return;
    }

    await CiJobs.create(jobId, Image.types.editor, repoVersionInfo, editorVersionInfo);
    logger.info(`CiJob created: ${jobId}`);
    await discordClient.disconnect();
  },
);
