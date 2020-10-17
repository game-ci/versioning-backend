import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';
import { scrapeVersions } from './scrapeVersions';
import { updateDatabase } from './updateDatabase';

export const ingestRepoVersions = async () => {
  try {
    const scrapedInfoList = await scrapeVersions();
    firebase.logger.info('Found versions', scrapedInfoList);

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
