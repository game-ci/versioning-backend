import { isMatch } from "lodash";
import { logger } from "firebase-functions/v2";
import { Discord } from "../../service/discord";
import { EditorVersionInfo } from "../../model/editorVersionInfo";

const plural = (amount: number) => {
  return amount === 1 ? "version" : "versions";
};

export const updateDatabase = async (
  ingestedInfoList: EditorVersionInfo[],
  discordClient: Discord,
): Promise<void> => {
  const existingInfoList = await EditorVersionInfo.getAll();

  const newVersions: EditorVersionInfo[] = [];
  const updatedVersions: EditorVersionInfo[] = [];

  ingestedInfoList.forEach((scrapedInfo) => {
    const { version } = scrapedInfo;
    const existingVersion = existingInfoList.find((info) =>
      info.version === version
    );

    if (!existingVersion) {
      newVersions.push(scrapedInfo);
      return;
    }

    if (!isMatch(existingVersion, scrapedInfo)) {
      updatedVersions.push(scrapedInfo);
      return;
    }
  });

  let message = "";

  if (newVersions.length >= 1) {
    await EditorVersionInfo.createMany(newVersions);
    message += `
      ${newVersions.length} new Unity editor ${
      plural(newVersions.length)
    } detected.
      (\`${newVersions.map((version) => version.version).join("`, `")}\`)`;
  }

  if (updatedVersions.length >= 1) {
    await EditorVersionInfo.updateMany(updatedVersions);
    message += `
      ${updatedVersions.length} updated Unity editor ${
      plural(updatedVersions.length)
    } detected.
      (\`${updatedVersions.map((version) => version.version).join("`, `")}\`)`;
  }

  message = message.trimEnd();
  if (message.length >= 1) {
    logger.info(message);
    await discordClient.sendMessageToMaintainers(message);
  } else {
    await discordClient.sendDebug(
      "Database is up-to-date. (no updated Unity versions found)",
    );
  }
};
