import { isMatch } from 'lodash';
import { firebase } from '../../config/firebase';
import { Discord } from '../../config/discord';
import { EditorVersionInfo } from '../../model/editorVersionInfo';

const plural = (amount: number) => {
  return amount === 1 ? 'version' : 'versions';
};

export const updateDatabase = async (ingestedInfoList: EditorVersionInfo[]): Promise<void> => {
  const existingInfoList = await EditorVersionInfo.getAll();

  const newVersions: EditorVersionInfo[] = [];
  const updatedVersions: EditorVersionInfo[] = [];

  ingestedInfoList.forEach((scrapedInfo) => {
    const { version } = scrapedInfo;
    const existingVersion = existingInfoList.find((info) => info.version === version);

    if (!existingVersion) {
      newVersions.push(scrapedInfo);
      return;
    }

    if (!isMatch(existingVersion, scrapedInfo)) {
      updatedVersions.push(scrapedInfo);
      return;
    }
  });

  let message = '';

  if (newVersions.length >= 1) {
    await EditorVersionInfo.createMany(newVersions);
    message += `${newVersions.length} new Unity editor ${plural(newVersions.length)} detected. `;
  }

  if (updatedVersions.length >= 1) {
    await EditorVersionInfo.updateMany(updatedVersions);
    message += `${updatedVersions.length} updated Unity editor ${plural(
      updatedVersions.length,
    )} detected. `;
  }

  message = message.trimEnd();
  if (message.length >= 1) {
    firebase.logger.info(message);
    await Discord.sendMessageToMaintainers(message);
  } else {
    firebase.logger.info('Database is up-to-date. (no updated info found)');
  }
};
