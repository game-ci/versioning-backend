import { logger } from 'firebase-functions/v2';
import { Discord } from '../../service/discord';
import { scrapeVersions } from './scrapeVersions';
import { updateDatabase } from './updateDatabase';

export const ingestRepoVersions = async (githubPrivateKey: string, githubClientSecret: string) => {
  try {
    const scrapedInfoList = await scrapeVersions(githubPrivateKey, githubClientSecret);

    // Note: this triggers repoVersionInfo.onCreate modelTrigger
    await updateDatabase(scrapedInfoList);
  } catch (err: any) {
    const message = `
        Something went wrong while importing repository versions for unity-ci/docker:
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

    logger.error(message);
    await Discord.sendAlert(message);
  }
};
