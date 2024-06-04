import { updateDatabase } from "./updateDatabase";
import { logger } from "firebase-functions/v2";
import { Discord } from "../../service/discord";
import { scrapeVersions } from "./scrapeVersions";

export const ingestUnityVersions = async (discordClient: Discord) => {
  try {
    const scrapedInfoList = await scrapeVersions();

    // Note: this triggers editorVersionInfo.onCreate modelTrigger
    await updateDatabase(scrapedInfoList, discordClient);
  } catch (err: any) {
    const message = `
        Something went wrong while importing new versions from unity:
        ${err.message} (${err.status})\n${err.stackTrace}
      `;

    logger.error(message);
    await discordClient.sendAlert(message);
  }
};
