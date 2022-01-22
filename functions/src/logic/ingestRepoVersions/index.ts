import { firebase } from '../../service/firebase';
import { Discord } from '../../service/discord';
import { scrapeVersions } from './scrapeVersions';
import { updateDatabase } from './updateDatabase';

export const ingestRepoVersions = async () => {
  try {
    const scrapedInfoList = await scrapeVersions();

    // Note: this triggers repoVersionInfo.onCreate modelTrigger
    await updateDatabase(scrapedInfoList);
  } catch (err) {
    const message = `
        Something went wrong while importing repository versions for unity-ci/docker:
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

    firebase.logger.error(message);
    await Discord.sendAlert(message);
  }
};
