import { updateDatabase } from './updateDatabase';
import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';
import { scrapeVersions } from './scrapeVersions';

export const ingestUnityVersions = async () => {
  try {
    const scrapedInfoList = await scrapeVersions();
    await updateDatabase(scrapedInfoList);
  } catch (err) {
    const message = `
        Something went wrong while importing new versions from unity:
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

    firebase.logger.error(message);
    await Discord.sendAlert(message);
  }
};
