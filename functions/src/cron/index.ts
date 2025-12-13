import { Discord } from '../service/discord';
import { ingestUnityVersions } from '../logic/ingestUnityVersions';
import { ingestRepoVersions } from '../logic/ingestRepoVersions';
import { cleanUpBuilds, scheduleBuildsFromTheQueue } from '../logic/buildQueue';
import { settings } from '../config/settings';
import { dataMigrations } from '../logic/dataTransformation';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

const discordToken = defineSecret('DISCORD_TOKEN');
const githubPrivateKeyConfigSecret = defineSecret('GITHUB_PRIVATE_KEY');
const githubClientSecretConfigSecret = defineSecret('GITHUB_CLIENT_SECRET');

const MINUTES: number = settings.minutesBetweenScans;
if (MINUTES < 10) {
  throw new Error('Is the result really worth the machine time? Remove me.');
}

// Timeout of 60 seconds will keep our routine process tight.
export const trigger = onSchedule(
  {
    schedule: `every ${MINUTES} minutes`,
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [discordToken, githubPrivateKeyConfigSecret, githubClientSecretConfigSecret],
  },
  async () => {
    await Discord.initSafely(discordToken.value());

    try {
      await routineTasks(
        githubPrivateKeyConfigSecret.value(),
        githubClientSecretConfigSecret.value(),
      );
    } catch (error: any) {
      const errorStatus = error.status ? ` (${error.status})` : '';
      const errorStack = error.stackTrace ? `\n${error.stackTrace}` : '';
      const fullError = `${error.message}${errorStatus}${errorStack}`;

      const routineTasksFailedMessage = `Something went wrong while running routine tasks.\n${fullError}`;

      logger.error(routineTasksFailedMessage);
      await Discord.sendAlert(routineTasksFailedMessage);
    }

    Discord.disconnect();
  },
);

const routineTasks = async (githubPrivateKey: string, githubClientSecret: string) => {
  try {
    await Discord.sendDebugLine('begin');
    await dataMigrations();
    await ingestRepoVersions(githubPrivateKey, githubClientSecret);
    await ingestUnityVersions();
    await cleanUpBuilds();
    await scheduleBuildsFromTheQueue(githubPrivateKey, githubClientSecret);
  } catch (error: any) {
    logger.error(error);
    await Discord.sendAlert(error);
  } finally {
    await Discord.sendDebugLine('end');
  }
};
